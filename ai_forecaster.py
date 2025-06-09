import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, r2_score
import joblib
import datetime
import os
import mysql.connector
from dotenv import load_dotenv
import argparse
import json
import sys

load_dotenv()

DB_USER = 'weewx'
DB_PASSWORD = os.getenv('WEEWX_DB_PASSWORD')
DB_HOST = '10.1.1.126'
DB_NAME = 'weewx'

MODEL_PATH = "/home/dave/projects/weather_predictor/weather_multi_model.pkl"
LOOKBACK_HOURS = 48
FORECAST_HOURS = 24
MIN_RECORDS_REQUIRED = 500

def get_data(days):
    engine = create_engine(f'mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}')
    query = f"""
        SELECT dateTime, pressure, outTemp, outHumidity, windSpeed, rain,
               lightning_distance, lightning_strike_count
        FROM archive
        WHERE dateTime > UNIX_TIMESTAMP(NOW() - INTERVAL {days} DAY)
        ORDER BY dateTime ASC
    """
    df = pd.read_sql(query, engine)
    df["timestamp"] = pd.to_datetime(df["dateTime"], unit="s")
    df.set_index("timestamp", inplace=True)
    return df

def engineer_features(df):
    df = df.copy()

    df['pressure_change'] = df['pressure'].diff(periods=12)
    df['temp_change'] = df['outTemp'].diff(periods=12)
    df['humidity_change'] = df['outHumidity'].diff(periods=12)
    df['rolling_rain'] = df['rain'].rolling(window=12).sum()
    df['wind_avg'] = df['windSpeed'].rolling(window=12).mean()

    df['lightning_distance_km'] = df['lightning_distance'] * 1.60934
    df['lightning_strike'] = df['lightning_strike_count'].fillna(0)
    df['lightning_last_hour'] = df['lightning_strike'].rolling(window=12, min_periods=1).sum()

    df['lightning_closest_km'] = (
        df['lightning_distance_km']
        .where(df['lightning_strike'] > 0)
        .rolling(window=12, min_periods=1)
        .min()
        .fillna(1000)
    )

    df = df.ffill().dropna()
    return df

def label_weather(df):
    df = df.copy()

    rain_future = df['rain'].shift(-FORECAST_HOURS * 12).fillna(0)
    wind_future = df['windSpeed'].shift(-FORECAST_HOURS * 12).fillna(0)
    humidity_now = df['outHumidity']
    temp_var = df['outTemp'].rolling(window=12).std()
    lightning_last_hour = df['lightning_last_hour']
    lightning_closest_km = df['lightning_closest_km']

    df['max_temp_future'] = df['outTemp'].rolling(window=FORECAST_HOURS * 12).max().shift(-FORECAST_HOURS * 12)
    df['min_temp_future'] = df['outTemp'].rolling(window=FORECAST_HOURS * 12).min().shift(-FORECAST_HOURS * 12)

    conditions = [
        ((rain_future > 2) & (wind_future > 20)) |
        ((lightning_last_hour > 1) & (lightning_closest_km < 15)),
        (rain_future > 0.2),
        (humidity_now > 80) & (temp_var < 1.0),
    ]
    choices = ['Storm', 'Rain', 'Cloudy']
    df['label'] = np.select(conditions, choices, default='Clear')

    df['wind_label'] = pd.cut(
        df['wind_avg'],
        bins=[-np.inf, 3, 5, 10, 25, np.inf],
        labels=['Calm', 'Light Breeze', 'Stiff Breeze', 'Windy', 'High Winds']
    )

    df = df.dropna(subset=['label', 'wind_label', 'max_temp_future', 'min_temp_future'], how='any')

    if len(df) < MIN_RECORDS_REQUIRED:
        print(f"🚫 Not enough data after filtering and labeling: only {len(df)} records available.")
        sys.exit(1)

    return df

def train_model(df):
    features = [
        'pressure', 'pressure_change', 'outTemp', 'temp_change',
        'outHumidity', 'humidity_change', 'rolling_rain', 'wind_avg',
        'lightning_last_hour', 'lightning_closest_km'
    ]

    X = df[features]
    y_weather = df['label']
    y_wind = df['wind_label']
    y_max_temp = df['max_temp_future']
    y_min_temp = df['min_temp_future']

    X_train, X_test, y_weather_train, y_weather_test = train_test_split(X, y_weather, test_size=0.2, stratify=y_weather)
    _, _, y_max_temp_train, y_max_temp_test = train_test_split(X, y_max_temp, test_size=0.2)
    _, _, y_min_temp_train, y_min_temp_test = train_test_split(X, y_min_temp, test_size=0.2)
    _, _, y_wind_train, y_wind_test = train_test_split(X, y_wind, test_size=0.2)

    weather_model = RandomForestClassifier(n_estimators=150, random_state=42, class_weight='balanced')
    weather_model.fit(X_train, y_weather_train)
    y_weather_pred = weather_model.predict(X_test)
    print("\nWeather Model Performance:\n", classification_report(y_weather_test, y_weather_pred))

    wind_model = RandomForestClassifier(n_estimators=150, random_state=42, class_weight='balanced')
    wind_model.fit(X_train, y_wind_train)
    y_wind_pred = wind_model.predict(X_test)
    print("\nWind Model Performance:\n", classification_report(y_wind_test, y_wind_pred))

    max_temp_model = RandomForestRegressor(n_estimators=150, random_state=42)
    min_temp_model = RandomForestRegressor(n_estimators=150, random_state=42)

    max_temp_model.fit(X_train, y_max_temp_train)
    min_temp_model.fit(X_train, y_min_temp_train)

    y_max_temp_pred = max_temp_model.predict(X_test)
    y_min_temp_pred = min_temp_model.predict(X_test)

    print("\nTemperature Models Performance:")
    print(f"Max Temperature R² Score: {r2_score(y_max_temp_test, y_max_temp_pred):.3f}")
    print(f"Min Temperature R² Score: {r2_score(y_min_temp_test, y_min_temp_pred):.3f}")

    models = {
        'weather': weather_model,
        'wind': wind_model,
        'max_temp': max_temp_model,
        'min_temp': min_temp_model
    }
    joblib.dump(models, MODEL_PATH)
    print(f"\nModels saved to {MODEL_PATH}")
    return models

def predict_future(df, models):
    latest = df.tail(1)
    features = [
        'pressure', 'pressure_change', 'outTemp', 'temp_change',
        'outHumidity', 'humidity_change', 'rolling_rain', 'wind_avg',
        'lightning_last_hour', 'lightning_closest_km'
    ]

    weather_model = models['weather']
    weather_pred = weather_model.predict(latest[features])[0]
    weather_probs = weather_model.predict_proba(latest[features])[0]
    class_labels = weather_model.classes_

    prob_dict = dict(zip(class_labels, weather_probs))
    chance_of_rain = 100 * (prob_dict.get('Rain', 0) + prob_dict.get('Storm', 0))
    chance_of_lightning = 100 * prob_dict.get('Storm', 0)

    wind_pred = models['wind'].predict(latest[features])[0]
    max_temp_pred = models['max_temp'].predict(latest[features])[0]
    min_temp_pred = models['min_temp'].predict(latest[features])[0]

    max_temp_celsius = (max_temp_pred - 32) * 5/9
    min_temp_celsius = (min_temp_pred - 32) * 5/9

    print(f"\nForecast for next {FORECAST_HOURS}h:")
    print(f"Weather: {weather_pred} | Wind: {wind_pred}")
    print(f"Chance of Rain: {chance_of_rain:.1f}% | Chance of Lightning: {chance_of_lightning:.1f}%")
    print(f"Temperature Range: {min_temp_celsius:.1f}°C to {max_temp_celsius:.1f}°C")

    return weather_pred, wind_pred, min_temp_celsius, max_temp_celsius, chance_of_rain, chance_of_lightning

def save_predictions(weather_pred, wind_pred, min_temp, max_temp, chance_of_rain, chance_of_lightning):
    forecasts_file = "/home/dave/projects/weather_predictor/forecasts/forecasts.json"
    os.makedirs(os.path.dirname(forecasts_file), exist_ok=True)
    current_date = datetime.datetime.now().strftime("%Y-%m-%d")

    new_prediction = {
        current_date: {
            "date": current_date,
            "predicted_min_temp": round(min_temp, 1),
            "predicted_max_temp": round(max_temp, 1),
            "ai_forecast": weather_pred,
            "ai_wind_forecast": wind_pred,
            "chance_of_rain": round(chance_of_rain, 1),
            "chance_of_lightning": round(chance_of_lightning, 1)
        }
    }

    if os.path.exists(forecasts_file):
        try:
            with open(forecasts_file, 'r') as f:
                forecasts = json.load(f)
        except json.JSONDecodeError:
            forecasts = {}
    else:
        forecasts = {}

    forecasts.update(new_prediction)

    with open(forecasts_file, 'w') as f:
        json.dump(forecasts, f, indent=4)

    print(f"\nPredictions saved to {forecasts_file}")

def main():
    parser = argparse.ArgumentParser(description='Weather forecasting with optional model retraining')
    parser.add_argument('--retrain', action='store_true', help='Retrain the model with new data')
    parser.add_argument('--days', type=int, default=60, help='Number of days of data to use for training (default: 60)')
    args = parser.parse_args()

    print(f"Fetching last {args.days} days of data...")
    df = get_data(args.days)
    df = engineer_features(df)
    df = label_weather(df)

    if args.retrain:
        print("Training new models...")
        models = train_model(df)
    else:
        try:
            models = joblib.load(MODEL_PATH)
            if 'wind' not in models:
                raise ValueError("Model file is outdated — missing 'wind' model.")
            print("Loaded existing models.")
        except:
            print("No existing models found or invalid. Training new models...")
            models = train_model(df)

    weather_pred, wind_pred, min_temp, max_temp, chance_of_rain, chance_of_lightning = predict_future(df, models)
    save_predictions(weather_pred, wind_pred, min_temp, max_temp, chance_of_rain, chance_of_lightning)

if __name__ == "__main__":
    main()

