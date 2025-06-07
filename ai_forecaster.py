import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib
import datetime
import os
import mysql.connector
from dotenv import load_dotenv
import argparse

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

    conditions = [
        (rain_future > 2) & (wind_future > 20),
        (rain_future > 0.2),
        (humidity_now > 80) & (temp_var < 1.0),
    ]
    choices = ['Storm', 'Rain', 'Cloudy']
    df['label'] = np.select(conditions, choices, default='Clear')

    df = df.dropna(subset=['label'])
    return df

# ------------------------------------
# MODEL TRAINING
# ------------------------------------
def train_model(df):
    features = ['pressure', 'pressure_change', 'outTemp', 'temp_change',
                'outHumidity', 'humidity_change', 'rolling_rain', 'wind_avg']
    X = df[features]
    y = df['label']

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, stratify=y)

    model = RandomForestClassifier(n_estimators=150, random_state=42, class_weight='balanced')
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    print("Model Performance:\n", classification_report(y_test, y_pred))

    joblib.dump(model, MODEL_PATH)
    print(f"Model saved to {MODEL_PATH}")
    return model

# ------------------------------------
# PREDICTION
# ------------------------------------
def predict_future(df, model):
    latest = df.tail(1)
    features = ['pressure', 'pressure_change', 'outTemp', 'temp_change',
                'outHumidity', 'humidity_change', 'rolling_rain', 'wind_avg']
    prediction = model.predict(latest[features])
    print(f"Forecast for {FORECAST_HOURS}h ahead: {prediction[0]}")
    return prediction[0]

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
        print("Training new model...")
        model = train_model(df)
    else:
        try:
            model = joblib.load(MODEL_PATH)
            print("Loaded existing model.")
        except:
            print("No existing model found. Training new model...")
            model = train_model(df)

    predict_future(df, model)

if __name__ == "__main__":
    main()