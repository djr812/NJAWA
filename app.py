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
import xml.etree.ElementTree as ET

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
SG_KEY = os.getenv('SG_KEY')
MY_LAT = -27.40737
MY_LNG = 152.91990


# QFD Alerts configuration
QFD_ALERTS_URL = "https://publiccontent-gis-psba-qld-gov-au.s3.amazonaws.com/content/Feeds/BushfireCurrentIncidents/bushfireAlert.json"
QFD_ALERTS_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'qfd_alerts_cache.json')
QFD_ALERTS_CACHE_TTL = 1800  # 30 minutes in seconds

# BOM Warnings configuration
BOM_WARNINGS_URL = "http://www.bom.gov.au/fwo/IDZ00056.warnings_qld.xml"
BOM_WARNINGS_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'bom_warnings_cache.json')
BOM_WARNINGS_CACHE_TTL = 1800  # 30 minutes in seconds

# Tides configuration
TIDES_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'tides_cache.json')
TIDES_CACHE_TTL = 86400  # 24 hours in seconds (cache for entire day)

# Dam Levels configuration
DAM_LEVELS_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'dam_levels_cache.json')
DAM_LEVELS_CACHE_TTL = 86400  # 24 hours in seconds (cache for entire day)

# Ferny Grove area suburbs for filtering alerts
FERNY_GROVE_AREA_SUBURBS = [
    'ferny grove', 'ferny hills', 'samford', 'the gap', 'keperra', 
    'upper kedron', 'camp mountain', 'enoggera reservoir', 'bunya', 
    'arana hills', 'samford village', 'samford valley', "jolly's lookout", 
    'wights mountain', 'mt nebo', 'mt glorious', 'yugar', 'clear mountain', 
    'everton hills'
]

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

@app.route('/api/qfd_alerts')
def api_qfd_alerts():
    """Fetch and filter QFD alerts for the Ferny Grove area"""
    now = time.time()
    
    # Try to load cache first
    if os.path.exists(QFD_ALERTS_CACHE_PATH):
        with open(QFD_ALERTS_CACHE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if now - cache.get('timestamp', 0) < QFD_ALERTS_CACHE_TTL:
                    return jsonify(cache['data'])
            except Exception:
                pass
    
    try:
        # Fetch data from QFD API
        response = requests.get(QFD_ALERTS_URL, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        # Filter alerts for Ferny Grove area
        relevant_alerts = []
        
        if 'features' in data:
            for feature in data['features']:
                if 'properties' in feature:
                    props = feature['properties']
                    
                    # Check if alert is relevant to Ferny Grove area
                    is_relevant = False
                    
                    # Check WarningArea field
                    if 'WarningArea' in props and props['WarningArea']:
                        warning_area = props['WarningArea'].lower()
                        for suburb in FERNY_GROVE_AREA_SUBURBS:
                            if suburb in warning_area:
                                is_relevant = True
                                break
                    
                    # Check Locality field
                    if not is_relevant and 'Locality' in props and props['Locality']:
                        locality = props['Locality'].lower()
                        for suburb in FERNY_GROVE_AREA_SUBURBS:
                            if suburb in locality:
                                is_relevant = True
                                break
                    
                    # Check WarningText field
                    if not is_relevant and 'WarningText' in props and props['WarningText']:
                        warning_text = props['WarningText'].lower()
                        for suburb in FERNY_GROVE_AREA_SUBURBS:
                            if suburb in warning_text:
                                is_relevant = True
                                break
                    
                    if is_relevant:
                        # Parse datetime
                        publish_date = None
                        if 'PublishDateLocal_ISO' in props and props['PublishDateLocal_ISO']:
                            try:
                                publish_date = datetime.fromisoformat(props['PublishDateLocal_ISO'].replace('Z', '+00:00'))
                                # Convert to Brisbane time
                                brisbane_tz = pytz.timezone('Australia/Brisbane')
                                if publish_date.tzinfo is None:
                                    publish_date = brisbane_tz.localize(publish_date)
                                else:
                                    publish_date = publish_date.astimezone(brisbane_tz)
                            except Exception:
                                publish_date = None
                        
                        alert = {
                            'warning_level': props.get('WarningLevel', 'Unknown'),
                            'warning_title': props.get('WarningTitle', 'No Title'),
                            'header': props.get('Header', 'No Header'),
                            'publish_date': publish_date.strftime('%Y-%m-%d %H:%M:%S') if publish_date else 'Unknown',
                            'locality': props.get('Locality', 'Unknown'),
                            'warning_area': props.get('WarningArea', 'Unknown'),
                            'current_status': props.get('CurrentStatus', 'Unknown'),
                            'location': props.get('Location', 'Unknown')
                        }
                        relevant_alerts.append(alert)
        
        # Sort by publish date (newest first)
        relevant_alerts.sort(key=lambda x: x['publish_date'], reverse=True)
        
        result = {
            'alerts': relevant_alerts,
            'count': len(relevant_alerts),
            'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        # Cache the result
        cache_data = {
            'timestamp': now,
            'data': result
        }
        with open(QFD_ALERTS_CACHE_PATH, 'w') as f:
            json.dump(cache_data, f)
        
        return jsonify(result)
        
    except Exception as e:
        # Return cached data if available, otherwise empty result
        if os.path.exists(QFD_ALERTS_CACHE_PATH):
            with open(QFD_ALERTS_CACHE_PATH, 'r') as f:
                try:
                    cache = json.load(f)
                    return jsonify(cache['data'])
                except Exception:
                    pass
        
        return jsonify({
            'alerts': [],
            'count': 0,
            'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'error': str(e)
        })

@app.route('/api/bom_warnings')
def api_bom_warnings():
    now = time.time()
    # Try to load cache
    if os.path.exists(BOM_WARNINGS_CACHE_PATH):
        with open(BOM_WARNINGS_CACHE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if now - cache.get('timestamp', 0) < BOM_WARNINGS_CACHE_TTL:
                    return jsonify(cache['data'])
            except Exception:
                pass

    try:
        headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36"} 
        response = requests.get(BOM_WARNINGS_URL, headers=headers, timeout=10)
        response.raise_for_status()
        root = ET.fromstring(response.content)
        
        marine_warnings = []
        land_warnings = []
        
        for warning in root.findall('.//warning'):
            warning_type = warning.get('type', '').lower()
            title = warning.find('title')
            description = warning.find('description')
            link = warning.find('link')
            pubDate = warning.find('pubDate')
            
            warning_data = {
                'title': title.text if title is not None else 'No title',
                'description': description.text if description is not None else 'No description',
                'link': link.text if link is not None else None,
                'pubDate': pubDate.text if pubDate is not None else 'Unknown date'
            }
            
            if warning_type == 'marine':
                marine_warnings.append(warning_data)
            elif warning_type == 'land':
                land_warnings.append(warning_data)
        
        result = {
            'marine_warnings': marine_warnings,
            'land_warnings': land_warnings,
            'marine_count': len(marine_warnings),
            'land_count': len(land_warnings),
            'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        # Cache the result
        cache_data = {
            'timestamp': now,
            'data': result
        }
        with open(BOM_WARNINGS_CACHE_PATH, 'w') as f:
            json.dump(cache_data, f)
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error fetching BOM warnings: {e}")
        return jsonify({
            'marine_warnings': [],
            'land_warnings': [],
            'marine_count': 0,
            'land_count': 0,
            'error': str(e)
        })

@app.route('/api/top_stats')
def api_top_stats():
    engine = create_engine(DB_URI)
    
    try:
        # Get first date in database
        first_date_query = "SELECT MIN(dateTime) as first_date FROM archive"
        first_date_df = pd.read_sql(first_date_query, engine)
        first_date = None
        if not first_date_df.empty and first_date_df['first_date'].iloc[0] is not None:
            first_date = pd.to_datetime(first_date_df['first_date'].iloc[0], unit='s')
            first_date = first_date.strftime('%B %d, %Y')
        
        # Maximum temperature
        max_temp_query = """
            SELECT outTemp, dateTime 
            FROM archive 
            WHERE outTemp IS NOT NULL 
            ORDER BY outTemp DESC 
            LIMIT 1
        """
        max_temp_df = pd.read_sql(max_temp_query, engine)
        max_temp = None
        max_temp_date = None
        if not max_temp_df.empty:
            max_temp = round((max_temp_df['outTemp'].iloc[0] - 32) * 5/9, 1)  # Convert F to C
            max_temp_date = pd.to_datetime(max_temp_df['dateTime'].iloc[0], unit='s').strftime('%B %d, %Y')
        
        # Minimum temperature
        min_temp_query = """
            SELECT outTemp, dateTime 
            FROM archive 
            WHERE outTemp IS NOT NULL 
            ORDER BY outTemp ASC 
            LIMIT 1
        """
        min_temp_df = pd.read_sql(min_temp_query, engine)
        min_temp = None
        min_temp_date = None
        if not min_temp_df.empty:
            min_temp = round((min_temp_df['outTemp'].iloc[0] - 32) * 5/9, 1)  # Convert F to C
            min_temp_date = pd.to_datetime(min_temp_df['dateTime'].iloc[0], unit='s').strftime('%B %d, %Y')
        
        # Highest humidity with corresponding temperature
        max_humidity_query = """
            SELECT outHumidity, outTemp, dateTime 
            FROM archive 
            WHERE outHumidity IS NOT NULL 
            ORDER BY outHumidity DESC 
            LIMIT 1
        """
        max_humidity_df = pd.read_sql(max_humidity_query, engine)
        max_humidity = None
        max_humidity_temp = None
        max_humidity_date = None
        if not max_humidity_df.empty:
            max_humidity = int(max_humidity_df['outHumidity'].iloc[0])
            max_humidity_temp = round((max_humidity_df['outTemp'].iloc[0] - 32) * 5/9, 1)  # Convert F to C
            max_humidity_date = pd.to_datetime(max_humidity_df['dateTime'].iloc[0], unit='s').strftime('%B %d, %Y')
        
        # Strongest wind gust
        max_wind_gust_query = """
            SELECT windGust, dateTime 
            FROM archive 
            WHERE windGust IS NOT NULL 
            ORDER BY windGust DESC 
            LIMIT 1
        """
        max_wind_gust_df = pd.read_sql(max_wind_gust_query, engine)
        max_wind_gust = None
        max_wind_gust_date = None
        if not max_wind_gust_df.empty:
            max_wind_gust = round(max_wind_gust_df['windGust'].iloc[0] * 1.60934, 1)  # Convert mph to km/h
            max_wind_gust_date = pd.to_datetime(max_wind_gust_df['dateTime'].iloc[0], unit='s').strftime('%B %d, %Y')
        
        # Most rainfall (24-hour period)
        max_rainfall_query = """
            SELECT 
                DATE(FROM_UNIXTIME(dateTime)) as rain_date,
                SUM(rain) as daily_rainfall,
                MAX(dateTime) as max_dateTime
            FROM archive 
            WHERE rain IS NOT NULL AND rain > 0
            GROUP BY DATE(FROM_UNIXTIME(dateTime))
            ORDER BY daily_rainfall DESC 
            LIMIT 1
        """
        max_rainfall_df = pd.read_sql(max_rainfall_query, engine)
        max_rainfall = None
        max_rainfall_date = None
        if not max_rainfall_df.empty:
            max_rainfall = round(max_rainfall_df['daily_rainfall'].iloc[0] * 25.4, 1)  # Convert inches to mm
            max_rainfall_date = pd.to_datetime(max_rainfall_df['rain_date'].iloc[0]).strftime('%B %d, %Y')
        
        # Maximum UV
        max_uv_query = """
            SELECT UV, dateTime 
            FROM archive 
            WHERE UV IS NOT NULL 
            ORDER BY UV DESC 
            LIMIT 1
        """
        max_uv_df = pd.read_sql(max_uv_query, engine)
        max_uv = None
        max_uv_date = None
        max_uv_risk = None
        if not max_uv_df.empty:
            max_uv = int(max_uv_df['UV'].iloc[0])
            max_uv_date = pd.to_datetime(max_uv_df['dateTime'].iloc[0], unit='s').strftime('%B %d, %Y')
            
            # Calculate risk level based on UV index
            if max_uv <= 2:
                max_uv_risk = 'Low'
            elif max_uv <= 5:
                max_uv_risk = 'Moderate'
            elif max_uv <= 7:
                max_uv_risk = 'High'
            elif max_uv <= 10:
                max_uv_risk = 'Very High'
            else:
                max_uv_risk = 'Extreme'
        
        # Worst PM10 pollution
        max_pm10_query = """
            SELECT pm10_0, dateTime 
            FROM archive 
            WHERE pm10_0 IS NOT NULL 
            ORDER BY pm10_0 DESC 
            LIMIT 1
        """
        max_pm10_df = pd.read_sql(max_pm10_query, engine)
        max_pm10 = None
        max_pm10_date = None
        max_pm10_level = None
        if not max_pm10_df.empty:
            max_pm10 = int(max_pm10_df['pm10_0'].iloc[0])
            max_pm10_date = pd.to_datetime(max_pm10_df['dateTime'].iloc[0], unit='s').strftime('%B %d, %Y')
            
            # Calculate pollution level based on PM10 value
            if max_pm10 >= 0 and max_pm10 <= 12:
                max_pm10_level = 'Good'
            elif max_pm10 > 12 and max_pm10 <= 35.4:
                max_pm10_level = 'Moderate'
            elif max_pm10 > 35.4 and max_pm10 <= 55.4:
                max_pm10_level = 'Poor'
            elif max_pm10 > 55.4 and max_pm10 <= 150.4:
                max_pm10_level = 'Unhealthy'
            elif max_pm10 > 150.4 and max_pm10 <= 250.4:
                max_pm10_level = 'Severe'
            elif max_pm10 > 250.4:
                max_pm10_level = 'Hazardous'
            else:
                max_pm10_level = 'Unknown'
        
        # Most lightning strikes
        max_lightning_query = """
            SELECT lightning_strike_count, dateTime 
            FROM archive 
            WHERE lightning_strike_count IS NOT NULL AND lightning_strike_count > 0
            ORDER BY lightning_strike_count DESC 
            LIMIT 1
        """
        max_lightning_df = pd.read_sql(max_lightning_query, engine)
        max_lightning = None
        max_lightning_date = None
        if not max_lightning_df.empty:
            max_lightning = int(max_lightning_df['lightning_strike_count'].iloc[0])
            max_lightning_date = pd.to_datetime(max_lightning_df['dateTime'].iloc[0], unit='s').strftime('%B %d, %Y')
        
        result = {
            'first_date': first_date,
            'max_temp': max_temp,
            'max_temp_date': max_temp_date,
            'min_temp': min_temp,
            'min_temp_date': min_temp_date,
            'max_humidity': max_humidity,
            'max_humidity_temp': max_humidity_temp,
            'max_humidity_date': max_humidity_date,
            'max_wind_gust': max_wind_gust,
            'max_wind_gust_date': max_wind_gust_date,
            'max_rainfall': max_rainfall,
            'max_rainfall_date': max_rainfall_date,
            'max_uv': max_uv,
            'max_uv_date': max_uv_date,
            'max_uv_risk': max_uv_risk,
            'max_pm10': max_pm10,
            'max_pm10_date': max_pm10_date,
            'max_pm10_level': max_pm10_level,
            'max_lightning': max_lightning,
            'max_lightning_date': max_lightning_date
        }
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error fetching top stats: {e}")
        return jsonify({
            'error': str(e),
            'first_date': 'Unknown',
            'max_temp': None,
            'max_temp_date': 'Unknown',
            'min_temp': None,
            'min_temp_date': 'Unknown',
            'max_humidity': None,
            'max_humidity_temp': None,
            'max_humidity_date': 'Unknown',
            'max_wind_gust': None,
            'max_wind_gust_date': 'Unknown',
            'max_rainfall': None,
            'max_rainfall_date': 'Unknown',
            'max_uv': None,
            'max_uv_date': 'Unknown',
            'max_uv_risk': None,
            'max_pm10': None,
            'max_pm10_date': 'Unknown',
            'max_pm10_level': None,
            'max_lightning': None,
            'max_lightning_date': 'Unknown'
        })

@app.route('/api/rainfall_24h')
def api_rainfall_24h():
    engine = create_engine(DB_URI)
    now = datetime.now()
    # Get rainfall for the last 24 hours
    start_time = int((now - timedelta(hours=24)).timestamp())
    end_time = int(now.timestamp())
    
    query = f'''
        SELECT SUM(rain) as total_rainfall
        FROM archive
        WHERE dateTime >= {start_time} AND dateTime <= {end_time}
    '''
    
    df = pd.read_sql(query, engine)
    total_rainfall = df['total_rainfall'].iloc[0] if not df.empty else 0
    
    return jsonify({'total_rainfall_24h': round(total_rainfall, 2)})

@app.route('/api/tides')
def api_tides():
    now = time.time()
    today = datetime.now().date().isoformat()
    tomorrow = (datetime.now().date() + timedelta(days=1)).isoformat()
    
    # Try to load cache
    if os.path.exists(TIDES_CACHE_PATH):
        with open(TIDES_CACHE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if cache.get('date') == today and now - cache.get('timestamp', 0) < TIDES_CACHE_TTL:
                    return jsonify(cache['data'])
            except Exception:
                pass
    
    # If no valid cache, fetch from API
    try:
        url = "https://api.stormglass.io/v2/tide/extremes/point"
        params = {
            'lat': MY_LAT,
            'lng': MY_LNG,
            'start': today,
            'end': tomorrow
        }
        headers = {
            'Authorization': SG_KEY
        }
        
        response = requests.get(url, params=params, headers=headers)
        response.raise_for_status()
        
        data = response.json()
        
        # Process the data
        tides_data = {
            'station_name': data['meta']['station']['name'],
            'station_source': data['meta']['station']['source'],
            'station_distance': data['meta']['station']['distance'],
            'tides': []
        }
        
        for tide in data['data']:
            # Convert UTC time to Brisbane time
            tide_time = datetime.fromisoformat(tide['time'].replace('Z', '+00:00'))
            brisbane_tz = pytz.timezone('Australia/Brisbane')
            tide_time_brisbane = tide_time.astimezone(brisbane_tz)
            
            tides_data['tides'].append({
                'height': tide['height'],
                'type': tide['type'],
                'time': tide_time_brisbane.strftime('%H:%M'),
                'time_full': tide_time_brisbane.strftime('%Y-%m-%d %H:%M'),
                'is_future': tide_time_brisbane > datetime.now(brisbane_tz)
            })
        
        # Sort tides by time
        tides_data['tides'].sort(key=lambda x: x['time_full'])
        
        # Cache the result
        cache_data = {
            'timestamp': now,
            'date': today,
            'data': tides_data
        }
        
        with open(TIDES_CACHE_PATH, 'w') as f:
            json.dump(cache_data, f)
        
        return jsonify(tides_data)
        
    except Exception as e:
        print(f"Error fetching tides data: {e}")
        return jsonify({
            'error': 'Failed to fetch tides data',
            'station_name': 'Unknown',
            'station_source': 'Unknown',
            'station_distance': 0,
            'tides': []
        })

@app.route('/api/dam-levels')
def api_dam_levels():
    now = time.time()
    today = datetime.now().date().isoformat()
    
    # Try to load cache
    if os.path.exists(DAM_LEVELS_CACHE_PATH):
        with open(DAM_LEVELS_CACHE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if cache.get('date') == today and now - cache.get('timestamp', 0) < DAM_LEVELS_CACHE_TTL:
                    return jsonify(cache['data'])
            except Exception:
                pass
    
    # If no valid cache, fetch from website
    try:
        url = "https://www.seqwater.com.au/dam-levels"
        
        chrome_options = Options()
        chrome_options.add_argument('--headless')
        chrome_options.add_argument('--no-sandbox')
        chrome_options.add_argument('--disable-dev-shm-usage')
        chrome_options.add_argument('--disable-gpu')
        chrome_options.add_argument('--window-size=1920,1080')
        
        service = Service('/usr/bin/chromedriver')
        driver = webdriver.Chrome(service=service, options=chrome_options)
        
        try:
            driver.get(url)
            # Wait for the page to load
            WebDriverWait(driver, 10).until(
                EC.presence_of_element_located((By.TAG_NAME, "table"))
            )
            
            # Find the dam levels table
            tables = driver.find_elements(By.TAG_NAME, "table")
            dam_data = []
            
            for table in tables:
                rows = table.find_elements(By.TAG_NAME, "tr")
                for row in rows:
                    cells = row.find_elements(By.TAG_NAME, "td")
                    if len(cells) >= 4:
                        dam_name = cells[0].text.strip()
                        
                        # Check if this is one of our target dams
                        target_dams = ['North Pine', 'Somerset', 'Wivenhoe']
                        if any(target in dam_name for target in target_dams):
                            # Only process dams that have "View historical dam levels" (these have correct data)
                            if 'View historical dam levels' not in dam_name:
                                continue
                                
                            # Filter out "View historical dam levels" text
                            dam_name = dam_name.replace('View historical dam levels', '').strip()
                            
                            try:
                                # Extract volume and percentage - need to check which columns have the right data
                                # Let's look at all cells to find the right data
                                volume_ml = None
                                percent_full = None
                                
                                for i, cell in enumerate(cells):
                                    cell_text = cell.text.strip()
                                    
                                    # Skip cells that contain "View historical dam levels"
                                    if 'View historical dam levels' in cell_text:
                                        continue
                                    
                                    # Look for volume data (contains "ML")
                                    if 'ML' in cell_text and volume_ml is None:
                                        # Remove "ML" and any spaces, then convert to float
                                        volume_text = cell_text.replace('ML', '').replace(' ', '').replace(',', '')
                                        try:
                                            volume_ml = float(volume_text)
                                        except ValueError:
                                            continue
                                    
                                    # Look for percentage data (contains "%")
                                    elif '%' in cell_text and percent_full is None:
                                        # Remove "%" and convert to float
                                        percent_text = cell_text.replace('%', '').strip()
                                        try:
                                            percent_full = float(percent_text)
                                        except ValueError:
                                            continue
                                
                                # Only add if we found both volume and percentage
                                if volume_ml is not None and percent_full is not None:
                                    # Determine color based on percentage
                                    if percent_full <= 19:
                                        color = '#FF0000'  # Bright Red
                                    elif percent_full <= 49:
                                        color = '#FF8C00'  # Bright Orange
                                    elif percent_full <= 70:
                                        color = '#4169E1'  # Royal Blue
                                    else:
                                        color = '#00FF00'  # Bright Green
                                    
                                    dam_data.append({
                                        'name': dam_name,
                                        'volume_ml': volume_ml,
                                        'percent_full': percent_full,
                                        'color': color
                                    })
                                
                            except (ValueError, AttributeError) as e:
                                print(f"Error parsing dam data for {dam_name}: {e}")
                                continue
            
            # Sort dams by name for consistent display
            dam_data.sort(key=lambda x: x['name'])
            
            # Cache the result
            cache_data = {
                'timestamp': now,
                'date': today,
                'data': {
                    'dams': dam_data,
                    'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                }
            }
            
            with open(DAM_LEVELS_CACHE_PATH, 'w') as f:
                json.dump(cache_data, f)
            
            return jsonify(cache_data['data'])
            
        finally:
            driver.quit()
        
    except Exception as e:
        print(f"Error fetching dam levels data: {e}")
        return jsonify({
            'error': 'Failed to fetch dam levels data',
            'dams': [],
            'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000) 