from flask import Flask, render_template, jsonify, request
from flask_cors import CORS
import os
import pandas as pd
from sqlalchemy import create_engine
import json
from datetime import datetime, timedelta
from dotenv import load_dotenv
import pytz
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import tempfile
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
import re
import requests

load_dotenv()

app = Flask(__name__)
CORS(app)

# Load DB credentials from environment variables
DB_USER = 'weewx'
DB_PASSWORD = os.getenv('WEEWX_DB_PASSWORD')
DB_HOST = '10.1.1.126'
DB_NAME = 'weewx'
DB_URI = f'mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}'
FORECASTS_PATH = os.path.join(os.path.dirname(__file__), 'forecasts', 'forecasts.json')
BATTERY_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'battery_cache.json')
BATTERY_CACHE_TTL = 43200  # 12 hours in seconds
WEATHER_CAM_CACHE_TTL = 300  # 5 minutes in seconds
WAPI_KEY = os.getenv('WAPI_KEY')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    return render_template('dashboard.html')

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
        SELECT dateTime, inTemp, outTemp, inHumidity, outHumidity, barometer, rain, windSpeed, windDir, heatIndex, windChill, lightning_strike_count, lightning_distance, luminosity, UV, cloudbase
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
    if 'luminosity' in df:
        df['luminosity'] = df['luminosity'] / 1000  # Lux to kLux
    if 'cloudbase' in df:
        df['cloudbase'] = df['cloudbase'] * 0.3048  # feet to meters
    
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
        'uv': safe_list(df['UV'].round(1)),
        'cloudbase': safe_list(df['cloudbase'].round(0)),
    }
    return jsonify(result)

@app.route('/api/training_days')
def api_training_days():
    engine = create_engine(DB_URI)
    query = """
        SELECT MIN(dateTime) as first_date, MAX(dateTime) as last_date
        FROM archive
    """
    df = pd.read_sql(query, engine)
    if not df.empty and df['first_date'].iloc[0] is not None and df['last_date'].iloc[0] is not None:
        first_date = pd.to_datetime(df['first_date'].iloc[0], unit='s')
        last_date = pd.to_datetime(df['last_date'].iloc[0], unit='s')
        days = (last_date - first_date).days
        return jsonify({'days': days})
    return jsonify({'days': 0})

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

@app.route('/api/battery')
def api_battery():
    now = time.time()
    # Try to load cache
    if os.path.exists(BATTERY_CACHE_PATH):
        with open(BATTERY_CACHE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if now - cache.get('timestamp', 0) < BATTERY_CACHE_TTL:
                    return jsonify(cache['data'])
            except Exception:
                pass

    chrome_options = Options()
    chrome_options.add_argument('--headless')
    chrome_options.add_argument('--no-sandbox')
    chrome_options.add_argument('--disable-dev-shm-usage')

    service = Service('/usr/bin/chromedriver')

    driver = webdriver.Chrome(service=service, options=chrome_options)
    try:
        url = 'https://www.ecowitt.net/home/index'
        driver.get(url)
        wait = WebDriverWait(driver, 4)
        # Login automation
        email_input = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='email']")))
        password_input = driver.find_element(By.CSS_SELECTOR, "input[type='password']")
        login_button = driver.find_element(By.CLASS_NAME, 'login-button')
        email = os.getenv('ECOWITT_EMAIL')
        password = os.getenv('ECOWITT_PASSWORD')
        email_input.clear()
        email_input.send_keys(email)
        password_input.clear()
        password_input.send_keys(password)
        login_button.click()
        wait.until(EC.presence_of_element_located((By.XPATH, "//*[contains(text(), 'Sensor Array')]")))
        time.sleep(4)  # Wait for all widgets to load
        result = {
            'console': {'label': 'Unknown', 'status': 'low'},
            'outdoor': {'label': 'Unknown', 'status': 'low'},
            'array': {'label': 'Unknown', 'status': 'low'},
            'lightning': {'label': 'Unknown', 'status': 'low'}
        }

        # Console
        try:
            device_elems = driver.find_elements(By.XPATH, "//div[contains(@class, 'device-name') and normalize-space(text())='Console']")
            console_voltage = None
            for device_elem in device_elems:
                try:
                    tooltip_elem = device_elem.find_element(By.XPATH, "following-sibling::div[contains(@class, 'ivu-tooltip')]")
                    console_voltage = tooltip_elem.text.strip()
                    break
                except Exception:
                    pass
            if console_voltage:
                try:
                    voltage = float(console_voltage.replace('V','').strip())
                    if voltage < 4.00:
                        result['console'] = {'label': 'LOW', 'status': 'low'}
                    else:
                        result['console'] = {'label': 'OK', 'status': 'ok'}
                except Exception:
                    pass
        except Exception:
            pass

        # Outdoor T&RH Sensor
        try:
            device_elems = driver.find_elements(By.XPATH, "//div[contains(@class, 'device-name') and normalize-space(text())='Outdoor T&RH Sensor']")
            outdoor_status = None
            for device_elem in device_elems:
                try:
                    tooltip_elem = device_elem.find_element(By.XPATH, "following-sibling::div[contains(@class, 'ivu-tooltip')]")
                    outdoor_status = tooltip_elem.text.strip().upper()
                    break
                except Exception:
                    pass
            if outdoor_status in ['OK', 'NORMAL']:
                result['outdoor'] = {'label': 'OK', 'status': 'ok'}
            elif outdoor_status:
                result['outdoor'] = {'label': 'LOW', 'status': 'low'}
        except Exception:
            pass

        # Sensor Array
        try:
            device_elems = driver.find_elements(By.XPATH, "//div[contains(@class, 'device-name') and normalize-space(text())='Sensor Array']")
            array_status = None
            for device_elem in device_elems:
                try:
                    tooltip_elem = device_elem.find_element(By.XPATH, "following-sibling::div[contains(@class, 'ivu-tooltip')]")
                    array_status = tooltip_elem.text.strip().upper()
                    break
                except Exception:
                    pass
            if array_status in ['OK', 'NORMAL']:
                result['array'] = {'label': 'OK', 'status': 'ok'}
            elif array_status:
                result['array'] = {'label': 'LOW', 'status': 'low'}
        except Exception:
            pass

        # Lightning Detector - Get from live data feed
        try:
            response = requests.get('http://10.1.1.184/get_livedata_info', timeout=5)
            if response.status_code == 200:
                data = response.json()
                lightning_data = data.get('lightning', [{}])[0]
                battery_value = lightning_data.get('battery')
                
                if battery_value is not None:
                    try:
                        battery_level = int(battery_value)
                        if battery_level >= 2:
                            result['lightning'] = {'label': 'OK', 'status': 'ok'}
                        else:
                            result['lightning'] = {'label': 'LOW', 'status': 'low'}
                    except (ValueError, TypeError):
                        result['lightning'] = {'label': 'Unknown', 'status': 'low'}
                else:
                    result['lightning'] = {'label': 'Unknown', 'status': 'low'}
            else:
                result['lightning'] = {'label': 'Unknown', 'status': 'low'}
        except Exception:
            result['lightning'] = {'label': 'Unknown', 'status': 'low'}

        # Cache the result
        with open(BATTERY_CACHE_PATH, 'w') as f:
            json.dump({'timestamp': now, 'data': result}, f)
        return jsonify(result)
    except Exception as e:
        return jsonify(result)
    finally:
        driver.quit()

@app.route('/api/bar_metrics')
def api_bar_metrics():
    try:
        response = requests.get('http://10.1.1.184/get_livedata_info', timeout=5)
        if response.status_code == 200:
            data = response.json()
            co2_data = data.get('co2', [{}])[0]
            return jsonify({
                'bar_area_temp': f"{co2_data.get('temp', '--')}°C",
                'bar_area_humidity': co2_data.get('humidity', '--'),
                'outside_co2': int(co2_data.get('CO2', 0)),
                'pm25': float(co2_data.get('PM25', 0)),
                'pm10': float(co2_data.get('PM10', 0))
            })
    except Exception as e:
        print(f"Error fetching bar metrics: {e}")
    return jsonify({
        'bar_area_temp': '--',
        'bar_area_humidity': '--',
        'outside_co2': None,
        'pm25': None,
        'pm10': None
    })

@app.route('/api/weather_condition')
def api_weather_condition():
    try:
        response = requests.get(f'http://api.weatherapi.com/v1/current.json?key={WAPI_KEY}&q=Samford&aqi=no')
        if response.status_code == 200:
            data = response.json()
            # Extract just the condition data we need
            condition = data['current']['condition']
            return jsonify({
                'text': condition['text'],
                'icon': condition['icon']
            })
        else:
            return jsonify({'error': 'Failed to fetch weather data'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False) 