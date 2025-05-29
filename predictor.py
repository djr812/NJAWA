import pandas as pd
import mysql.connector
from prophet import Prophet
import subprocess
from datetime import datetime, timedelta
import tempfile
from sqlalchemy import create_engine
import json
import os
from dotenv import load_dotenv

load_dotenv()

# 1. Connect to MySQL and query data
def fetch_data():
    DB_USER = 'weewx'
    DB_PASSWORD = os.getenv('WEEWX_DB_PASSWORD')
    DB_HOST = '10.1.1.126'
    DB_NAME = 'weewx'
    engine = create_engine(f'mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}')
    query = """
    SELECT dateTime, outTemp
    FROM archive
    WHERE dateTime >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 60 DAY))
    """
    df = pd.read_sql(query, engine)
    df['dateTime'] = pd.to_datetime(df['dateTime'], unit='s')
    return df

# 2. Prepare data for Prophet
def prepare_data(df):
    # Convert temperature from Fahrenheit to Celsius
    df['outTemp'] = (df['outTemp'] - 32) * 5/9
    
    df = df.resample('D', on='dateTime').mean().reset_index()
    df = df.rename(columns={'dateTime': 'ds', 'outTemp': 'y'})
    return df.dropna()

# 3. Train model and forecast
def make_forecast(df):
    model = Prophet()
    model.fit(df)
    future = model.make_future_dataframe(periods=1)
    forecast = model.predict(future)
    # Get the last row of the forecast which contains tomorrow's prediction
    last_forecast = forecast.iloc[-1]
    return {
        'ds': last_forecast['ds'],
        'yhat': last_forecast['yhat'],  # Already in Celsius from our conversion
        'min_temp': last_forecast['yhat_lower'],  # Already in Celsius
        'max_temp': last_forecast['yhat_upper']   # Already in Celsius
    }

# 4. Send email using msmtp
def send_email(forecast, to_email="dave@djrogers.net.au", from_email="dave@djrogers.net.au"):
    subject = f"Daily Weather Forecast for {forecast['ds'].date()}"
    body = (
        f"📈 Weather Forecast for {forecast['ds'].date()}:\n"
        f"- Predicted Temperature: {forecast['yhat']:.1f}°C\n"
        f"- Temperature Range: {forecast['min_temp']:.1f}°C – {forecast['max_temp']:.1f}°C\n"
    )

    email_content = f"""From: {from_email}
To: {to_email}
Subject: {subject}

{body}
"""

    # Use echo to pipe the content directly to msmtp
    process = subprocess.Popen(['msmtp', '-a', 'default', to_email], stdin=subprocess.PIPE)
    process.communicate(input=email_content.encode())

# Save forecast to a JSON file
def save_forecast_to_json(forecast, output_dir="/home/dave/projects/weather_predictor/forecasts"):
    os.makedirs(output_dir, exist_ok=True)
    file_path = os.path.join(output_dir, "forecasts.json")
    forecast_date = forecast['ds'].date().isoformat()

    # Load existing forecasts if the file exists
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            all_forecasts = json.load(f)
    else:
        all_forecasts = {}

    # Update or add the new forecast
    all_forecasts[forecast_date] = {
        'date': forecast_date,
        'predicted_min_temp': round(forecast['min_temp'], 1),
        'predicted_max_temp': round(forecast['max_temp'], 1),
        'predicted_mean_temp': round(forecast['yhat'], 1)
    }

    # Save back to the file
    with open(file_path, 'w') as f:
        json.dump(all_forecasts, f, indent=4)

# 5. Main routine
def main():
    raw_data = fetch_data()
    prepared = prepare_data(raw_data)
    forecast = make_forecast(prepared)
    save_forecast_to_json(forecast)
    send_email(forecast)

if __name__ == '__main__':
    main()
