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
BATTERY_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'battery_cache.json')
BATTERY_CACHE_TTL = 300  # 5 minutes

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
    if 'luminosity' in df:
        df['luminosity'] = df['luminosity'] / 1000  # Lux to kLux
    
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
            'lightning': {'label': 'Unknown', 'status': 'low'},
            'bar_area_temp': None,
            'bar_area_humidity': None,
        }
        # Scrape Bar Area Temp & Humidity and Outside CO2
        try:
            # Find all divs
            all_divs = driver.find_elements(By.XPATH, "//div")
            found_bar_area = False
            found_temp_label = False
            found_humidity_label = False
            found_temp_value = False
            found_humidity_value = False
            found_outside_co2 = False
            found_co2_label = False
            found_co2_value = False
            found_pm25_title = False
            found_pm25_label = False
            found_pm25_value = False
            found_pm10_title = False
            found_pm10_label = False
            found_pm10_value = False
            for i, div in enumerate(all_divs):
                classes = div.get_attribute('class').split()
                text = div.text.strip()
                if not found_bar_area and 'cell' in classes and 'title' in classes and text == 'Bar Area':
                    found_bar_area = True
                elif found_bar_area and not found_temp_label and 'cell' in classes and 'Temperature' in text:
                    found_temp_label = True
                elif found_temp_label and not found_temp_value and 'ivu-tooltip' in classes:
                    result['bar_area_temp'] = div.text.strip()
                    found_temp_value = True
                elif found_temp_value and not found_humidity_label and 'cell' in classes and 'Humidity' in text:
                    found_humidity_label = True
                elif found_humidity_label and not found_humidity_value and 'ivu-tooltip' in classes:
                    result['bar_area_humidity'] = div.text.strip()
                    found_humidity_value = True
                # Outside CO2 logic
                if not found_outside_co2 and 'cell' in classes and 'title' in classes and text == 'Outside CO2':
                    found_outside_co2 = True
                elif found_outside_co2 and not found_co2_label and 'cell' in classes and 'CO2' in text:
                    found_co2_label = True
                elif found_co2_label and not found_co2_value and 'ivu-tooltip' in classes:
                    result['outside_co2'] = div.text.strip()
                    found_co2_value = True
                # PM2.5 logic
                if not found_pm25_title and 'cell' in classes and 'title' in classes and text == 'PM2.5 Air Quality':
                    found_pm25_title = True
                elif found_pm25_title and not found_pm25_label and 'cell' in classes and 'Current' in text:
                    found_pm25_label = True
                elif found_pm25_label and not found_pm25_value and 'ivu-tooltip' in classes:
                    result['pm25'] = div.text.strip()
                    found_pm25_value = True
                # PM10 logic
                if not found_pm10_title and 'cell' in classes and 'title' in classes and text == 'PM10 Air Quality':
                    found_pm10_title = True
                elif found_pm10_title and not found_pm10_label and 'cell' in classes and 'Current' in text:
                    found_pm10_label = True
                elif found_pm10_label and not found_pm10_value and 'ivu-tooltip' in classes:
                    result['pm10'] = div.text.strip()
                    found_pm10_value = True
            # Clean up values
            if result['bar_area_temp']:
                temp_val = ''.join(c for c in result['bar_area_temp'] if (c.isdigit() or c=='.' or c=='-'))
                result['bar_area_temp'] = f"{temp_val}°C" if temp_val else None
            if result['bar_area_humidity']:
                hum_val = ''.join(c for c in result['bar_area_humidity'] if (c.isdigit() or c=='.'))
                result['bar_area_humidity'] = f"{hum_val}%" if hum_val else None
            if result.get('outside_co2'):
                co2_val = ''.join(c for c in result['outside_co2'] if c.isdigit())
                result['outside_co2'] = int(co2_val) if co2_val else None
            if result.get('pm25'):
                pm25_val = re.findall(r'[-+]?[0-9]*\.?[0-9]+', result['pm25'])
                result['pm25'] = float(pm25_val[0]) if pm25_val else None
            if result.get('pm10'):
                pm10_val = re.findall(r'[-+]?[0-9]*\.?[0-9]+', result['pm10'])
                result['pm10'] = float(pm10_val[0]) if pm10_val else None
        except Exception as e:
            pass
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
        # Lightning Sensor (robust: find device-name 'Lightning Sensor', then next ivu-tooltip div, check img src)
        try:
            device_elems = driver.find_elements(By.XPATH, "//div[contains(@class, 'device-name') and normalize-space(text())='Lightning Sensor']")
            lightning_status = None
            for device_elem in device_elems:
                try:
                    tooltip_elem = device_elem.find_element(By.XPATH, "following-sibling::div[contains(@class, 'ivu-tooltip')]")
                    img = tooltip_elem.find_element(By.TAG_NAME, 'img')
                    src = img.get_attribute('src')
                    if src and src.startswith('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACgAAAAZCAMAAAB0BpxXAAAAyVBMVEWZmZkcupqZmZmZmZmZmZmZmZmZmZkcupqZmZkcupp5opmZmZmZmZkcupqZmZlZqpqZmZkeuZpeqZl4opmZmZmZmZmPnJlPrJqZmZmZmZmZmZmZmZkcupqZmZkkuJqZmZmXmpmZmZkmt5qZmZmZmZmZmZmZmZlbqZmPnJlQrJqHnpmZmZmZmZmZmZlnpplnpplvpJmZmZmZmZmZmZkdupojuJqZmZmHnplQrJo8spocupqZmZlnppmZmZlHr5oguZpvpJkcupqZmZkFgNBJAAAAQXRSTlMBePIEnt9mtHT3wLChb3etM+m+imMGtK2G9+TbdVstGMZAJ+vVy8G3tq6cgHBSREM+LCAO7OG7ua+tqJiXk2RdP27US9gAAAD8SURBVDjLxZMJb4IwGECxsiqUQ2cHAmPAPOY8NnX3POv//1H2owJRA9EY4wt5kC8vLYFUiinnI2V81HyKMaZwpVAqbn4UpJ3/7d3l4nWHSRmFbqiqP4RYqmoR0ottJQ7d9khsX8at7h9jyvKtzlh9/A5exx7D5KuHBg8irCJNYYz964yjH9lEzTSUYVApgUt7Pi903I6fbF0Uvmw40xNWvIewdq1Qu9WKl4fZd3QCCI3i0HTaJDr3X2snhwqEjzDWj5yFQ0QqfLB64rnyfOjPPhrsDtjI82TTnhtGw7Yb3K/c6fNvv+NSSRA0Ww4qQJtIO6Z4Iecyq07EK24BpwZ3o+WYpo4AAAAASUVORK5CYII='):
                        lightning_status = 'OK'
                    else:
                        lightning_status = 'LOW'
                    break
                except Exception:
                    pass
            if lightning_status == 'OK':
                result['lightning'] = {'label': 'OK', 'status': 'ok'}
            elif lightning_status:
                result['lightning'] = {'label': 'LOW', 'status': 'low'}
        except Exception:
            pass
        # Save cache
        with open(BATTERY_CACHE_PATH, 'w') as f:
            json.dump({'timestamp': now, 'data': result}, f)
        return jsonify(result)
    finally:
        driver.quit()

if __name__ == '__main__':
    app.run(debug=False) 