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
import pytz

load_dotenv()

# 1. Connect to MySQL and query temperature and pressure data
def fetch_data():
    DB_USER = 'weewx'
    DB_PASSWORD = os.getenv('WEEWX_DB_PASSWORD')
    DB_HOST = '10.1.1.126'
    DB_NAME = 'weewx'
    engine = create_engine(f'mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}')
    
    # Fetch 60 days of temperature and pressure
    query = """
    SELECT dateTime, outTemp, barometer
    FROM archive
    WHERE dateTime >= UNIX_TIMESTAMP(DATE_SUB(NOW(), INTERVAL 60 DAY))
    """
    df = pd.read_sql(query, engine)
    df['dateTime'] = pd.to_datetime(df['dateTime'], unit='s')
    return df

# 2. Prepare data for Prophet (temp only)
def prepare_data(df):
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
    last_forecast = forecast.iloc[-1]
    return {
        'ds': last_forecast['ds'],
        'yhat': last_forecast['yhat'],
        'min_temp': last_forecast['yhat_lower'],
        'max_temp': last_forecast['yhat_upper']
    }

# 🆕 4. Barometric pressure trend-based forecast
def pressure_forecast(df):
    now = df['dateTime'].max()
    twelve_hours_ago = now - timedelta(hours=12)

    recent = df[df['dateTime'] > now - timedelta(hours=1)]['barometer'].mean()
    previous = df[(df['dateTime'] > twelve_hours_ago) & (df['dateTime'] <= now - timedelta(hours=1))]['barometer'].mean()
    
    if pd.isna(recent) or pd.isna(previous):
        return "Insufficient pressure data"

    delta = recent - previous

    if recent > 1020 and delta > 0:
        return "Sunny and dry"
    elif 1013 <= recent <= 1020 and abs(delta) < 0.5:
        return "Partly cloudy and stable"
    elif recent < 1010 and delta < -1:
        return "Rain or storms likely"
    elif delta > 1:
        return "Improving conditions"
    elif delta < -1:
        return "Worsening conditions, clouds or rain"
    else:
        return "Mixed or stable weather"

# 5. Send email using msmtp
def send_email(forecast, pressure_outlook, to_email="dave@djrogers.net.au", from_email="dave@djrogers.net.au"):
    subject = f"Daily Weather Forecast for {forecast['ds'].date()}"
    body = (
        f"📈 Weather Forecast for {forecast['ds'].date()}:\n"
        f"- Predicted Mean Temp: {forecast['yhat']:.1f}°C\n"
        f"- Temperature Range: {forecast['min_temp']:.1f}°C – {forecast['max_temp']:.1f}°C\n\n"
        f"🌡️ Pressure-Based Outlook:\n"
        f"- {pressure_outlook}\n"
    )

    email_content = f"""From: {from_email}
To: {to_email}
Subject: {subject}

{body}
"""

    process = subprocess.Popen(['msmtp', '-a', 'default', to_email], stdin=subprocess.PIPE)
    process.communicate(input=email_content.encode())

# 6. Save forecast and pressure outlook to JSON
def save_forecast_to_json(forecast, pressure_outlook, output_dir="/home/dave/projects/weather_predictor/forecasts"):
    os.makedirs(output_dir, exist_ok=True)
    file_path = os.path.join(output_dir, "forecasts.json")
    forecast_date = forecast['ds'].date().isoformat()

    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            all_forecasts = json.load(f)
    else:
        all_forecasts = {}

    all_forecasts[forecast_date] = {
        'date': forecast_date,
        'predicted_min_temp': round(forecast['min_temp'], 1),
        'predicted_max_temp': round(forecast['max_temp'], 1),
        'predicted_mean_temp': round(forecast['yhat'], 1),
        'pressure_forecast': pressure_outlook
    }

    with open(file_path, 'w') as f:
        json.dump(all_forecasts, f, indent=4)

# 7. Main routine
def main():
    # Use local time for scheduling
    tz = pytz.timezone('Australia/Brisbane')
    now = datetime.now(tz)
    run_make_forecast = now.hour == 1 and now.minute < 10  # Run between 01:00 and 01:09

    raw_data = fetch_data()
    pressure_outlook = pressure_forecast(raw_data)

    if run_make_forecast:
        prepared = prepare_data(raw_data)
        forecast = make_forecast(prepared)
        save_forecast_to_json(forecast, pressure_outlook)
        send_email(forecast, pressure_outlook)
    else:
        # Load the most recent forecast from forecasts.json
        output_dir = "/home/dave/projects/weather_predictor/forecasts"
        file_path = os.path.join(output_dir, "forecasts.json")
        forecast_date = now.date().isoformat()
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                all_forecasts = json.load(f)
            # Use the most recent forecast (latest date)
            if all_forecasts:
                latest_date = max(all_forecasts.keys())
                latest = all_forecasts[latest_date]
                forecast = {
                    'ds': now,
                    'yhat': latest.get('predicted_mean_temp'),
                    'min_temp': latest.get('predicted_min_temp'),
                    'max_temp': latest.get('predicted_max_temp')
                }
            else:
                forecast = {'ds': now, 'yhat': None, 'min_temp': None, 'max_temp': None}
        else:
            forecast = {'ds': now, 'yhat': None, 'min_temp': None, 'max_temp': None}
        save_forecast_to_json(forecast, pressure_outlook)

if __name__ == '__main__':
    main()
