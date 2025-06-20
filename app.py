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

# QFD Alerts configuration
QFD_ALERTS_URL = "https://publiccontent-gis-psba-qld-gov-au.s3.amazonaws.com/content/Feeds/BushfireCurrentIncidents/bushfireAlert.json"
QFD_ALERTS_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'qfd_alerts_cache.json')
QFD_ALERTS_CACHE_TTL = 1800  # 30 minutes in seconds

# BOM Warnings configuration
BOM_WARNINGS_URL = "http://www.bom.gov.au/fwo/IDZ00056.warnings_qld.xml"
BOM_WARNINGS_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'bom_warnings_cache.json')
BOM_WARNINGS_CACHE_TTL = 1800  # 30 minutes in seconds

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
    """Fetch and parse BOM Queensland warnings from RSS feed"""
    now = time.time()
    
    # Try to load cache first
    if os.path.exists(BOM_WARNINGS_CACHE_PATH):
        with open(BOM_WARNINGS_CACHE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if now - cache.get('timestamp', 0) < BOM_WARNINGS_CACHE_TTL:
                    return jsonify(cache['data'])
            except Exception:
                pass
    
    try:
        # Fetch data from BOM RSS feed
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(BOM_WARNINGS_URL, headers=headers, timeout=10)
        response.raise_for_status()
        
        # Parse XML
        root = ET.fromstring(response.content)
        
        # Initialize warnings containers
        marine_warnings = []
        land_warnings = []
        
        # Find all items - try different approaches for XML structure
        items = root.findall('.//item')
        if not items:
            # Try alternative paths
            items = root.findall('item')
        if not items:
            # Try with namespace
            items = root.findall('.//{http://purl.org/rss/1.0/}item')
        
        print(f"Found {len(items)} items in RSS feed")
        
        for item in items:
            try:
                # Extract title, description, pubDate, and link
                title_elem = item.find('title')
                description_elem = item.find('description')
                pubDate_elem = item.find('pubDate')
                link_elem = item.find('link')
                
                # Get text content safely
                title_text = title_elem.text.strip() if title_elem is not None and title_elem.text else ''
                desc_text = description_elem.text.strip() if description_elem is not None and description_elem.text else ''
                pub_date = pubDate_elem.text.strip() if pubDate_elem is not None and pubDate_elem.text else ''
                link_url = link_elem.text.strip() if link_elem is not None and link_elem.text else ''
                
                print(f"Processing item: {title_text}")
                
                if title_text:  # Only process items with titles
                    warning = {
                        'title': title_text,
                        'description': desc_text,
                        'pubDate': pub_date,
                        'link': link_url
                    }
                    
                    # Categorize warnings based on title and description
                    title_lower = title_text.lower()
                    desc_lower = desc_text.lower()
                    
                    # Check for marine-related keywords
                    marine_keywords = ['marine', 'coastal', 'boat', 'sailing', 'fishing', 'water', 'sea', 'ocean', 'harbour', 'port']
                    is_marine = any(keyword in title_lower or keyword in desc_lower for keyword in marine_keywords)
                    
                    if is_marine:
                        marine_warnings.append(warning)
                        print(f"  -> Categorized as Marine warning")
                    else:
                        land_warnings.append(warning)
                        print(f"  -> Categorized as Land warning")
                        
            except Exception as e:
                print(f"Error parsing warning item: {e}")
                continue
        
        result = {
            'marine_warnings': marine_warnings,
            'land_warnings': land_warnings,
            'marine_count': len(marine_warnings),
            'land_count': len(land_warnings),
            'total_count': len(marine_warnings) + len(land_warnings),
            'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        }
        
        print(f"Final result: {result['marine_count']} marine, {result['land_count']} land warnings")
        
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
        # Return cached data if available, otherwise empty result
        if os.path.exists(BOM_WARNINGS_CACHE_PATH):
            with open(BOM_WARNINGS_CACHE_PATH, 'r') as f:
                try:
                    cache = json.load(f)
                    return jsonify(cache['data'])
                except Exception:
                    pass
        
        return jsonify({
            'marine_warnings': [],
            'land_warnings': [],
            'marine_count': 0,
            'land_count': 0,
            'total_count': 0,
            'last_updated': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'error': str(e)
        })

if __name__ == '__main__':
    app.run(debug=False) 