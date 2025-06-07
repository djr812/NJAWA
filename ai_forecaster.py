import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, mean_squared_error, r2_score
import joblib
import datetime
import os
import mysql.connector
from dotenv import load_dotenv
import argparse
import json

load_dotenv()

# ------------------------------------
# CONFIGURATION
# ------------------------------------
DB_USER = 'weewx'
DB_PASSWORD = os.getenv('WEEWX_DB_PASSWORD')
DB_HOST = '10.1.1.126'
DB_NAME = 'weewx'

MODEL_PATH = "weather_multi_model.pkl"
LOOKBACK_HOURS = 48
FORECAST_HOURS = 24

# ------------------------------------
# DATABASE CONNECTION
# ------------------------------------
def get_data():
    engine = create_engine(f'mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}')

    query = f"""
        SELECT dateTime, pressure, outTemp, outHumidity, windSpeed, rain
        FROM archive
        WHERE dateTime > UNIX_TIMESTAMP(NOW() - INTERVAL 10 DAY)
        ORDER BY dateTime ASC
    """
    df = pd.read_sql(query, engine)
    df["timestamp"] = pd.to_datetime(df["dateTime"], unit="s")
    df.set_index("timestamp", inplace=True)
    return df

# ------------------------------------
# FEATURE ENGINEERING
# ------------------------------------
def engineer_features(df):
    df = df.copy()

    df['pressure_change'] = df['pressure'].diff(periods=12)  # 1 hour
    df['temp_change'] = df['outTemp'].diff(periods=12)
    df['humidity_change'] = df['outHumidity'].diff(periods=12)
    df['rolling_rain'] = df['rain'].rolling(window=12).sum()
    df['wind_avg'] = df['windSpeed'].rolling(window=12).mean()

    df = df.ffill().dropna()
    return df

# ------------------------------------
# MULTI-CLASS LABELING
# ------------------------------------
def label_weather(df):
    df = df.copy()
    rain_future = df['rain'].shift(-FORECAST_HOURS * 12).fillna(0)
    wind_future = df['windSpeed'].shift(-FORECAST_HOURS * 12).fillna(0)
    humidity_now = df['outHumidity']
    temp_var = df['outTemp'].rolling(window=12).std()

    # Add future temperature predictions
    df['max_temp_future'] = df['outTemp'].rolling(window=FORECAST_HOURS * 12).max().shift(-FORECAST_HOURS * 12)
    df['min_temp_future'] = df['outTemp'].rolling(window=FORECAST_HOURS * 12).min().shift(-FORECAST_HOURS * 12)

    conditions = [
        (rain_future > 2) & (wind_future > 20),
        (rain_future > 0.2),
        (humidity_now > 80) & (temp_var < 1.0),
    ]
    choices = ['Storm', 'Rain', 'Cloudy']
    df['label'] = np.select(conditions, choices, default='Clear')

    df = df.dropna(subset=['label', 'max_temp_future', 'min_temp_future'])
    return df

# ------------------------------------
# MODEL TRAINING
# ------------------------------------
def train_model(df):
    features = ['pressure', 'pressure_change', 'outTemp', 'temp_change',
                'outHumidity', 'humidity_change', 'rolling_rain', 'wind_avg']
    X = df[features]
    y_weather = df['label']
    y_max_temp = df['max_temp_future']
    y_min_temp = df['min_temp_future']

    X_train, X_test, y_weather_train, y_weather_test = train_test_split(X, y_weather, test_size=0.2, stratify=y_weather)
    _, _, y_max_temp_train, y_max_temp_test = train_test_split(X, y_max_temp, test_size=0.2)
    _, _, y_min_temp_train, y_min_temp_test = train_test_split(X, y_min_temp, test_size=0.2)

    # Weather classification model
    weather_model = RandomForestClassifier(n_estimators=150, random_state=42, class_weight='balanced')
    weather_model.fit(X_train, y_weather_train)
    y_weather_pred = weather_model.predict(X_test)
    print("\nWeather Model Performance:\n", classification_report(y_weather_test, y_weather_pred))

    # Temperature regression models
    max_temp_model = RandomForestRegressor(n_estimators=150, random_state=42)
    min_temp_model = RandomForestRegressor(n_estimators=150, random_state=42)
    
    max_temp_model.fit(X_train, y_max_temp_train)
    min_temp_model.fit(X_train, y_min_temp_train)
    
    y_max_temp_pred = max_temp_model.predict(X_test)
    y_min_temp_pred = min_temp_model.predict(X_test)
    
    print("\nTemperature Models Performance:")
    print(f"Max Temperature R² Score: {r2_score(y_max_temp_test, y_max_temp_pred):.3f}")
    print(f"Min Temperature R² Score: {r2_score(y_min_temp_test, y_min_temp_pred):.3f}")

    # Save all models
    models = {
        'weather': weather_model,
        'max_temp': max_temp_model,
        'min_temp': min_temp_model
    }
    joblib.dump(models, MODEL_PATH)
    print(f"\nModels saved to {MODEL_PATH}")
    return models

# ------------------------------------
# PREDICTION
# ------------------------------------
def predict_future(df, models):
    latest = df.tail(1)
    features = ['pressure', 'pressure_change', 'outTemp', 'temp_change',
                'outHumidity', 'humidity_change', 'rolling_rain', 'wind_avg']
    
    weather_pred = models['weather'].predict(latest[features])[0]
    max_temp_pred = models['max_temp'].predict(latest[features])[0]
    min_temp_pred = models['min_temp'].predict(latest[features])[0]
    
    # Convert Fahrenheit to Celsius
    max_temp_celsius = (max_temp_pred - 32) * 5/9
    min_temp_celsius = (min_temp_pred - 32) * 5/9
    
    print(f"\nForecast for next {FORECAST_HOURS}h:")
    print(f"Weather Condition: {weather_pred}")
    print(f"Temperature Range: {min_temp_celsius:.1f}°C to {max_temp_celsius:.1f}°C")
    return weather_pred, min_temp_celsius, max_temp_celsius

# ------------------------------------
# SAVE PREDICTIONS
# ------------------------------------
def save_predictions(weather_pred, min_temp, max_temp):
    forecasts_file = "forecasts/forecasts.json"
    
    # Create forecasts directory if it doesn't exist
    os.makedirs(os.path.dirname(forecasts_file), exist_ok=True)
    
    # Get current date in YYYY-MM-DD format
    current_date = datetime.datetime.now().strftime("%Y-%m-%d")
    
    # Create new prediction entry
    new_prediction = {
        current_date: {
            "date": current_date,
            "predicted_min_temp": round(min_temp, 1),
            "predicted_max_temp": round(max_temp, 1),
            "ai_forecast": weather_pred
        }
    }
    
    # Read existing forecasts if file exists
    if os.path.exists(forecasts_file):
        try:
            with open(forecasts_file, 'r') as f:
                forecasts = json.load(f)
        except json.JSONDecodeError:
            forecasts = {}
    else:
        forecasts = {}
    
    # Update or add new prediction
    forecasts.update(new_prediction)
    
    # Write back to file
    with open(forecasts_file, 'w') as f:
        json.dump(forecasts, f, indent=4)
    
    print(f"\nPredictions saved to {forecasts_file}")

# ------------------------------------
# MAIN
# ------------------------------------
def main():
    parser = argparse.ArgumentParser(description='Weather forecasting with optional model retraining')
    parser.add_argument('--retrain', action='store_true', help='Retrain the model with new data')
    args = parser.parse_args()

    print("Fetching data...")
    df = get_data()
    df = engineer_features(df)
    df = label_weather(df)

    if args.retrain:
        print("Training new models...")
        models = train_model(df)
    else:
        try:
            models = joblib.load(MODEL_PATH)
            print("Loaded existing models.")
        except:
            print("No existing models found. Training new models...")
            models = train_model(df)

    weather_pred, min_temp, max_temp = predict_future(df, models)
    save_predictions(weather_pred, min_temp, max_temp)

if __name__ == "__main__":
    main()