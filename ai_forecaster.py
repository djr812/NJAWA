import pandas as pd
import numpy as np
from sqlalchemy import create_engine
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, r2_score
import joblib
import datetime
import os
from dotenv import load_dotenv
import argparse
import json
import sys
import warnings

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
    """
    Author:
        David Rogers
    Email:
        dave@djrogers.net.au
    Summary:
        Retrieve historical weather data from the weewx database for model training and prediction.
    Description:
        Connects to the weewx MySQL database and queries the archive table for weather data
        from the specified number of days ago up to the current time. Extracts key weather
        metrics including pressure, temperature, humidity, wind speed, rainfall, and lightning
        data. Converts the Unix timestamp to a pandas datetime index for time-series analysis.
        This function serves as the primary data source for the AI weather forecasting system.
    Args:
        days (int): Number of days of historical data to retrieve from the database.
    Returns:
        pandas.DataFrame: DataFrame containing historical weather data with timestamp index.
    Raises:
        Exception: When database connection fails or query execution errors occur.
    """
    engine = create_engine(f'mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}')
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
    """
    Author:
        David Rogers
    Email:
        dave@djrogers.net.au
    Summary:
        Create engineered features from raw weather data for machine learning model training.
    Description:
        Transforms raw weather data into features suitable for machine learning by creating
        derived metrics and temporal features. Calculates pressure, temperature, and humidity
        changes over 12-hour periods. Computes rolling averages for rainfall and wind speed.
        Converts lightning distance to kilometers and creates lightning-related features.
        Adds seasonal and temporal features including month, day of year, hour, and cyclical
        encoding of day of year using sine and cosine transformations. Handles missing data
        through forward-fill and dropna operations to ensure data quality for model training.
    Args:
        df (pandas.DataFrame): Raw weather data DataFrame with timestamp index.
    Returns:
        pandas.DataFrame: DataFrame with engineered features ready for model training.
    Raises:
        None: Function handles data cleaning internally.
    """
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

    df['month'] = df.index.month
    df['day_of_year'] = df.index.dayofyear
    df['hour'] = df.index.hour
    df['sin_doy'] = np.sin(2 * np.pi * df['day_of_year'] / 365.25)
    df['cos_doy'] = np.cos(2 * np.pi * df['day_of_year'] / 365.25)

    df = df.ffill().dropna()
    return df

def label_weather(df):
    """
    Author:
        David Rogers
    Email:
        dave@djrogers.net.au
    Summary:
        Create target labels for weather conditions, wind conditions, and temperature ranges.
    Description:
        Generates supervised learning targets by analyzing future weather patterns and
        current conditions. Creates weather condition labels (Storm, Rain, Cloudy, Clear)
        based on future rainfall, wind conditions, lightning activity, and humidity levels.
        Categorizes wind conditions into five levels (Calm, Light Breeze, Stiff Breeze,
        Windy, High Winds) using rolling average wind speeds. Calculates future maximum
        and minimum temperatures for temperature range prediction. Applies business rules
        to determine weather conditions: storms require high rainfall/wind or lightning
        activity, rain requires measurable precipitation, cloudy conditions are identified
        by high humidity and low temperature variability. Filters out records with missing
        labels and ensures minimum data requirements are met for model training.
    Args:
        df (pandas.DataFrame): DataFrame with engineered features and weather data.
    Returns:
        pandas.DataFrame: DataFrame with target labels for weather, wind, and temperature prediction.
    Raises:
        SystemExit: When insufficient data remains after filtering and labeling.
    """
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
        print(f"\U0001F6D1 Not enough data after filtering and labeling: only {len(df)} records available.")
        sys.exit(1)

    return df

def train_model(df):
    """
    Author:
        David Rogers
    Email:
        dave@djrogers.net.au
    Summary:
        Train multiple machine learning models for weather, wind, and temperature prediction.
    Description:
        Trains four separate machine learning models using Random Forest algorithms:
        1. Weather condition classifier (Clear, Cloudy, Rain, Storm)
        2. Wind condition classifier (Calm, Light Breeze, Stiff Breeze, Windy, High Winds)
        3. Maximum temperature regressor
        4. Minimum temperature regressor
        
        Uses engineered features including pressure changes, temperature trends, humidity
        patterns, rainfall accumulation, wind averages, lightning activity, and temporal
        features. Splits data into training and testing sets (80/20) with stratification
        for classification tasks. Trains models with 150 estimators and balanced class
        weights for classification models. Evaluates model performance using classification
        reports for categorical predictions and R² scores for temperature regression.
        Saves all trained models to a single pickle file for later use in predictions.
    Args:
        df (pandas.DataFrame): DataFrame with engineered features and target labels.
    Returns:
        dict: Dictionary containing four trained machine learning models.
    Raises:
        Exception: When model training fails or file saving errors occur.
    """
    features = [
        'pressure', 'pressure_change', 'outTemp', 'temp_change',
        'outHumidity', 'humidity_change', 'rolling_rain', 'wind_avg',
        'lightning_last_hour', 'lightning_closest_km',
        'month', 'day_of_year', 'hour', 'sin_doy', 'cos_doy'
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
    print("\nWeather Model Performance:\n", classification_report(y_weather_test, weather_model.predict(X_test)))

    wind_model = RandomForestClassifier(n_estimators=150, random_state=42, class_weight='balanced')
    wind_model.fit(X_train, y_wind_train)
    print("\nWind Model Performance:\n", classification_report(y_wind_test, wind_model.predict(X_test)))

    max_temp_model = RandomForestRegressor(n_estimators=150, random_state=42)
    min_temp_model = RandomForestRegressor(n_estimators=150, random_state=42)

    max_temp_model.fit(X_train, y_max_temp_train)
    min_temp_model.fit(X_train, y_min_temp_train)

    print("\nTemperature Models Performance:")
    print(f"Max Temperature R² Score: {r2_score(y_max_temp_test, max_temp_model.predict(X_test)):.3f}")
    print(f"Min Temperature R² Score: {r2_score(y_min_temp_test, min_temp_model.predict(X_test)):.3f}")

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
    """
    Author:
        David Rogers
    Email:
        dave@djrogers.net.au
    Summary:
        Generate weather predictions for the next 24 hours using trained machine learning models.
    Description:
        Uses the most recent weather data to predict future weather conditions, wind patterns,
        and temperature ranges. Extracts features from the latest data point and applies
        all four trained models (weather, wind, max temp, min temp) to generate predictions.
        Calculates probability distributions for weather conditions to determine chance of
        rain and lightning. Uses ensemble predictions from individual decision trees to
        estimate prediction uncertainty and confidence levels. Converts temperature predictions
        from Fahrenheit to Celsius and calculates error margins. Computes confidence levels
        for all predictions based on model uncertainty and probability distributions.
        Returns comprehensive prediction results including weather conditions, wind patterns,
        temperature ranges with error margins, precipitation probabilities, and confidence
        levels for all predictions.
    Args:
        df (pandas.DataFrame): DataFrame with engineered features and historical data.
        models (dict): Dictionary containing four trained machine learning models.
    Returns:
        tuple: Tuple containing weather prediction, wind prediction, temperature predictions,
               error margins, probabilities, and confidence levels for all predictions.
    Raises:
        Exception: When prediction fails or model inference errors occur.
    """
    latest = df.tail(1)
    features = [
        'pressure', 'pressure_change', 'outTemp', 'temp_change',
        'outHumidity', 'humidity_change', 'rolling_rain', 'wind_avg',
        'lightning_last_hour', 'lightning_closest_km',
        'month', 'day_of_year', 'hour', 'sin_doy', 'cos_doy'
    ]

    latest_features = latest[features]

    weather_model = models['weather']
    weather_pred = weather_model.predict(latest_features)[0]
    weather_probs = weather_model.predict_proba(latest_features)[0]
    class_labels = weather_model.classes_

    prob_dict = dict(zip(class_labels, weather_probs))
    chance_of_rain = 100 * (prob_dict.get('Rain', 0) + prob_dict.get('Storm', 0))
    chance_of_lightning = 100 * prob_dict.get('Storm', 0)
    
    # Calculate confidence levels for rain and lightning
    rain_confidence = 100 * max(prob_dict.get('Rain', 0) + prob_dict.get('Storm', 0), 
                              1 - (prob_dict.get('Rain', 0) + prob_dict.get('Storm', 0)))
    lightning_confidence = 100 * max(prob_dict.get('Storm', 0), 1 - prob_dict.get('Storm', 0))

    wind_pred = models['wind'].predict(latest_features)[0]
    max_temp_model = models['max_temp']
    min_temp_model = models['min_temp']

    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=UserWarning)
        max_temp_preds = np.array([tree.predict(latest_features.values)[0] for tree in max_temp_model.estimators_])
        min_temp_preds = np.array([tree.predict(latest_features.values)[0] for tree in min_temp_model.estimators_])

    max_temp_mean = np.mean(max_temp_preds)
    min_temp_mean = np.mean(min_temp_preds)
    max_temp_std = np.std(max_temp_preds)
    min_temp_std = np.std(min_temp_preds)

    # Convert to Celsius
    max_temp_c = (max_temp_mean - 32) * 5/9
    min_temp_c = (min_temp_mean - 32) * 5/9
    max_temp_err = max_temp_std * 5/9
    min_temp_err = min_temp_std * 5/9

    # Calculate temperature confidence levels (95% confidence interval)
    max_temp_confidence = 100 * (1 - (2 * max_temp_err) / max_temp_c)
    min_temp_confidence = 100 * (1 - (2 * min_temp_err) / min_temp_c)

    return (weather_pred, wind_pred, min_temp_c, max_temp_c, min_temp_err, max_temp_err, 
            chance_of_rain, chance_of_lightning, rain_confidence, lightning_confidence,
            max_temp_confidence, min_temp_confidence)

def save_predictions(weather_pred, wind_pred, min_temp, max_temp, min_temp_err, max_temp_err, 
                    chance_of_rain, chance_of_lightning, rain_confidence, lightning_confidence,
                    max_temp_confidence, min_temp_confidence):
    """
    Author:
        David Rogers
    Email:
        dave@djrogers.net.au
    Summary:
        Save weather predictions to a JSON file for display on the web dashboard.
    Description:
        Creates a structured JSON object containing all weather predictions and metadata
        for the current date. Formats temperature predictions with error margins and
        confidence levels. Includes weather condition forecasts, wind predictions,
        precipitation probabilities, and lightning chances. Creates the forecasts
        directory if it doesn't exist. Loads existing predictions from the JSON file
        and updates with new predictions for the current date. Handles JSON file
        corruption by creating a new file if loading fails. Saves the updated
        predictions with proper formatting and indentation for readability.
        The saved predictions are used by the web dashboard to display AI weather
        forecasts to users.
    Args:
        weather_pred (str): Predicted weather condition (Clear, Cloudy, Rain, Storm).
        wind_pred (str): Predicted wind condition (Calm, Light Breeze, etc.).
        min_temp (float): Predicted minimum temperature in Celsius.
        max_temp (float): Predicted maximum temperature in Celsius.
        min_temp_err (float): Error margin for minimum temperature prediction.
        max_temp_err (float): Error margin for maximum temperature prediction.
        chance_of_rain (float): Probability of rain as a percentage.
        chance_of_lightning (float): Probability of lightning as a percentage.
        rain_confidence (float): Confidence level for rain prediction.
        lightning_confidence (float): Confidence level for lightning prediction.
        max_temp_confidence (float): Confidence level for maximum temperature prediction.
        min_temp_confidence (float): Confidence level for minimum temperature prediction.
    Returns:
        None: Predictions are saved to file system.
    Raises:
        Exception: When file operations fail or JSON serialization errors occur.
    """
    forecasts_file = "/home/dave/projects/weather_predictor/forecasts/forecasts.json"
    os.makedirs(os.path.dirname(forecasts_file), exist_ok=True)
    current_date = datetime.datetime.now().strftime("%Y-%m-%d")

    new_prediction = {
        current_date: {
            "date": current_date,
            "predicted_min_temp": round(min_temp, 1),
            "predicted_min_temp_error": round(min_temp_err, 1),
            "predicted_min_temp_range": f"{round(min_temp - min_temp_err, 1)} to {round(min_temp + min_temp_err, 1)}",
            "predicted_min_temp_confidence": round(min_temp_confidence, 1),
            "predicted_max_temp": round(max_temp, 1),
            "predicted_max_temp_error": round(max_temp_err, 1),
            "predicted_max_temp_range": f"{round(max_temp - max_temp_err, 1)} to {round(max_temp + max_temp_err, 1)}",
            "predicted_max_temp_confidence": round(max_temp_confidence, 1),
            "ai_forecast": weather_pred,
            "ai_wind_forecast": wind_pred,
            "chance_of_rain": round(chance_of_rain, 1),
            "chance_of_rain_confidence": round(rain_confidence, 1),
            "chance_of_lightning": round(chance_of_lightning, 1),
            "chance_of_lightning_confidence": round(lightning_confidence, 1)
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

def main():
    """
    Author:
        David Rogers
    Email:
        dave@djrogers.net.au
    Summary:
        Main execution function for the AI weather forecasting system.
    Description:
        Orchestrates the complete weather forecasting pipeline from data retrieval
        to prediction generation and storage. Handles command-line arguments for
        model retraining and data window configuration. Retrieves historical weather
        data, engineers features, creates target labels, and either loads existing
        models or trains new ones based on user preferences. Generates predictions
        for the next 24 hours and saves results to the forecasts directory.
        Provides user feedback throughout the process including data retrieval status,
        model training progress, and prediction completion. Supports both training
        and inference modes with appropriate error handling and fallback mechanisms.
    Args:
        --retrain (bool): Optional flag to retrain models with new data.
        --days (int): Number of days of historical data to use (default: 60).
    Returns:
        None: Executes the complete forecasting pipeline.
    Raises:
        SystemExit: When insufficient data is available or critical errors occur.
    """
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

    predictions = predict_future(df, models)
    save_predictions(*predictions)

if __name__ == "__main__":
    main()
