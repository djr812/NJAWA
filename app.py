from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import os
import pandas as pd
from sqlalchemy import create_engine
import json
from datetime import datetime, timedelta
from dotenv import load_dotenv
import pytz

load_dotenv()

app = Flask(__name__)
CORS(app)

# Load DB credentials from environment variables
DB_USER = 'weewx'
DB_PASSWORD = os.getenv('WEEWX_DB_PASSWORD')
DB_HOST = '10.1.1.126'
DB_NAME = 'weewx'
DB_URI = f'mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}'
FORECASTS_PATH = os.path.join(os.path.dirname(__file__), 'forecasts', 'forecasts.json')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data')
def api_data():
    period = request.args.get('period', '24h')
    engine = create_engine(DB_URI)
    now = datetime.now()
    if period == '72h':
        start_time = int((now - timedelta(hours=72)).timestamp())
    elif period == '7d':
        start_time = int((now - timedelta(days=7)).timestamp())
    elif period == '28d':
        start_time = int((now - timedelta(days=28)).timestamp())
    else:  # default to 24h
        start_time = int((now - timedelta(hours=24)).timestamp())
    end_time = int((now - timedelta(minutes=5)).timestamp())
    query = f'''
        SELECT dateTime, inTemp, outTemp, inHumidity, outHumidity, barometer, rain, windSpeed, windDir, heatIndex, windChill, lightning_strike_count, lightning_distance, luminosity
        FROM archive
        WHERE dateTime >= {start_time} AND dateTime <= {end_time}
        ORDER BY dateTime ASC
    '''
    df = pd.read_sql(query, engine)
    # Localize to Australia/Brisbane (UTC+10, no DST)
    df['dateTime'] = pd.to_datetime(df['dateTime'], unit='s', utc=True).dt.tz_convert('Australia/Brisbane')
    df['inTemp'] = (df['inTemp'] - 32) * 5/9
    df['outTemp'] = (df['outTemp'] - 32) * 5/9
    df['barometer'] = df['barometer'] * 33.8639  # Convert inHg to hPa
    df['heatIndex'] = (df['heatIndex'] - 32) * 5/9
    df['windChill'] = (df['windChill'] - 32) * 5/9
    df['lightning_distance'] = df['lightning_distance'] * 1.60934  # miles to km
    
    def safe_list(col):
        return [x if pd.notnull(x) else None for x in col]

    result = {
        'dateTime': df['dateTime'].dt.strftime('%Y-%m-%d %H:%M:%S').tolist(),
        'inTemp': safe_list(df['inTemp'].round(2)),
        'outTemp': safe_list(df['outTemp'].round(2)),
        'inHumidity': safe_list(df['inHumidity']),
        'outHumidity': safe_list(df['outHumidity']),
        'barometer': safe_list(df['barometer'].round(2)),
        'rain': safe_list(df['rain']),
        'windSpeed': safe_list(df['windSpeed']),
        'windDir': safe_list(df['windDir']),
        'heatIndex': safe_list(df['heatIndex'].round(2)),
        'windChill': safe_list(df['windChill'].round(2)),
        'lightning_strike_count': safe_list(df['lightning_strike_count']),
        'lightning_distance': safe_list(df['lightning_distance'].round(2)),
        'luminosity': safe_list(df['luminosity']),
    }
    return jsonify(result)

@app.route('/api/forecast')
def api_forecast():
    # Get today's date
    today = datetime.now().date().isoformat()
    if not os.path.exists(FORECASTS_PATH):
        return jsonify({})
    with open(FORECASTS_PATH, 'r') as f:
        forecasts = json.load(f)
    forecast = forecasts.get(today)
    if not forecast and forecasts:
        # Return the most recent available forecast
        latest_date = max(forecasts.keys())
        forecast = forecasts[latest_date]
    return jsonify(forecast or {})

if __name__ == '__main__':
    app.run(debug=True) 