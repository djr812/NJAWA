from flask import Flask, render_template, jsonify
from flask_cors import CORS
import os
import pandas as pd
from sqlalchemy import create_engine
import json
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Load DB credentials from environment variables
DB_USER = 'weewx'
DB_PASSWORD = os.getenv('WEEWX_DB_PASSWORD')
DB_HOST = 'localhost'
DB_NAME = 'weewx'
DB_URI = f'mysql+mysqlconnector://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}'
FORECASTS_PATH = os.path.join(os.path.dirname(__file__), 'forecasts', 'forecasts.json')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/data')
def api_data():
    engine = create_engine(DB_URI)
    since = int((datetime.now() - timedelta(days=7)).timestamp())
    query = f'''
        SELECT dateTime, inTemp, outTemp, inHumidity, outHumidity, barometer, rain, windSpeed, windDir
        FROM archive
        WHERE dateTime >= {since}
        ORDER BY dateTime ASC
    '''
    df = pd.read_sql(query, engine)
    # Convert timestamps
    df['dateTime'] = pd.to_datetime(df['dateTime'], unit='s')
    # Convert F to C for temps
    df['inTemp'] = (df['inTemp'] - 32) * 5/9
    df['outTemp'] = (df['outTemp'] - 32) * 5/9
    # Prepare output
    result = {
        'dateTime': df['dateTime'].dt.strftime('%Y-%m-%d %H:%M:%S').tolist(),
        'inTemp': df['inTemp'].round(2).tolist(),
        'outTemp': df['outTemp'].round(2).tolist(),
        'inHumidity': df['inHumidity'].tolist(),
        'outHumidity': df['outHumidity'].tolist(),
        'barometer': df['barometer'].tolist(),
        'rain': df['rain'].tolist(),
        'windSpeed': df['windSpeed'].tolist(),
        'windDir': df['windDir'].tolist(),
    }
    return jsonify(result)

@app.route('/api/forecast')
def api_forecast():
    # Get yesterday's date
    yesterday = (datetime.now() - timedelta(days=1)).date().isoformat()
    if not os.path.exists(FORECASTS_PATH):
        return jsonify({})
    with open(FORECASTS_PATH, 'r') as f:
        forecasts = json.load(f)
    forecast = forecasts.get(yesterday, {})
    return jsonify(forecast)

if __name__ == '__main__':
    app.run(debug=True) 