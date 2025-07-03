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
import math

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
BOM_WARNINGS_CACHE_TTL = 36000  # 6 hours in seconds

# Tides configuration
TIDES_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'tides_cache.json')
TIDES_CACHE_TTL = 86400  # 24 hours in seconds (cache for entire day)

# Dam Levels configuration
DAM_LEVELS_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'dam_levels_cache.json')
DAM_LEVELS_CACHE_TTL = 86400  # 24 hours in seconds (cache for entire day)

# Capital Cities configuration
CAPITAL_CITIES_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'capital_cities_cache.json')
CAPITAL_CITIES_CACHE_TTL = 3600  # 1 hour in seconds

# Weekly Statistics configuration
WEEKLY_STATS_CACHE_PATH = os.path.join(os.path.dirname(__file__), 'weekly_stats_cache.json')
WEEKLY_STATS_CACHE_TTL = 604800  # 7 days in seconds (1 week)

# Ferny Grove area suburbs for filtering alerts
FERNY_GROVE_AREA_SUBURBS = [
    'ferny grove', 'ferny hills', 'samford', 'the gap', 'keperra', 
    'upper kedron', 'camp mountain', 'enoggera reservoir', 'bunya', 
    'arana hills', 'samford village', 'samford valley', "jolly's lookout", 
    'wights mountain', 'mt nebo', 'mt glorious', 'yugar', 'clear mountain', 
    'everton hills'
]

def generate_weekly_stats_cache():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Generate and cache weekly statistics data for improved performance.
    Description:
    	Calculates weekly statistics for current, previous, and trends data and stores them in a cache file.
    	This function is designed to be called weekly (e.g., Sunday at 1 AM) to pre-generate the data
    	and avoid expensive database queries during page loads. The cache includes all three weekly stats
    	endpoints: current, previous, and trends.
    Args:
        None
    Returns:
        bool: True if cache was successfully generated, False otherwise.
    Raises:
        Exception: When database connection fails, query execution errors occur, or cache writing fails.
    """
    try:
        engine = create_engine(DB_URI)
        now = time.time()
        
        # Calculate the previous week (Sunday to Saturday)
        current_time = datetime.now()
        days_since_saturday = (current_time.weekday() - 5) % 7
        last_saturday = current_time - timedelta(days=days_since_saturday)
        
        # Current week (previous week)
        week_start = last_saturday - timedelta(days=6)
        week_end = last_saturday
        
        # Previous week
        previous_week_start = last_saturday - timedelta(days=13)
        previous_week_end = last_saturday - timedelta(days=7)
        
        # Week 3 for trends
        week3_start = last_saturday - timedelta(days=20)
        week3_end = last_saturday - timedelta(days=14)
        
        # Convert to timestamps
        start_time = int(week_start.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
        end_time = int(week_end.replace(hour=23, minute=59, second=59, microsecond=999999).timestamp())
        
        previous_start_time = int(previous_week_start.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
        previous_end_time = int(previous_week_end.replace(hour=23, minute=59, second=59, microsecond=999999).timestamp())
        
        week3_start_time = int(week3_start.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
        week3_end_time = int(week3_end.replace(hour=23, minute=59, second=59, microsecond=999999).timestamp())
        
        # Generate current week data
        current_query = f"""
            SELECT 
                MIN(outTemp) as min_temp,
                MAX(outTemp) as max_temp,
                AVG(outTemp) as avg_temp,
                MIN(outHumidity) as min_humidity,
                MAX(outHumidity) as max_humidity,
                AVG(outHumidity) as avg_humidity,
                MIN(barometer) as min_pressure,
                MAX(barometer) as max_pressure,
                AVG(barometer) as avg_pressure,
                MAX(windGust) as max_wind_gust,
                AVG(windSpeed) as avg_wind_speed,
                SUM(rain) as total_rainfall,
                MAX(UV) as max_uv,
                AVG(UV) as avg_uv,
                MAX(lightning_strike_count) as max_lightning_strikes,
                SUM(lightning_strike_count) as total_lightning_strikes,
                MAX(pm10_0) as max_pm10,
                AVG(pm10_0) as avg_pm10
            FROM archive
            WHERE dateTime >= {start_time} AND dateTime <= {end_time}
        """
        
        # Generate previous week data
        previous_query = f"""
            SELECT 
                MIN(outTemp) as min_temp,
                MAX(outTemp) as max_temp,
                AVG(outTemp) as avg_temp,
                MIN(outHumidity) as min_humidity,
                MAX(outHumidity) as max_humidity,
                AVG(outHumidity) as avg_humidity,
                MIN(barometer) as min_pressure,
                MAX(barometer) as max_pressure,
                AVG(barometer) as avg_pressure,
                MAX(windGust) as max_wind_gust,
                AVG(windSpeed) as avg_wind_speed,
                SUM(rain) as total_rainfall,
                MAX(UV) as max_uv,
                AVG(UV) as avg_uv,
                MAX(lightning_strike_count) as max_lightning_strikes,
                SUM(lightning_strike_count) as total_lightning_strikes,
                MAX(pm10_0) as max_pm10,
                AVG(pm10_0) as avg_pm10
            FROM archive
            WHERE dateTime >= {previous_start_time} AND dateTime <= {previous_end_time}
        """
        
        # Generate week 3 data for trends
        week3_query = f"""
            SELECT 
                MIN(outTemp) as min_temp,
                MAX(outTemp) as max_temp,
                AVG(outTemp) as avg_temp,
                MIN(outHumidity) as min_humidity,
                MAX(outHumidity) as max_humidity,
                AVG(outHumidity) as avg_humidity,
                MIN(barometer) as min_pressure,
                MAX(barometer) as max_pressure,
                AVG(barometer) as avg_pressure,
                MAX(windGust) as max_wind_gust,
                AVG(windSpeed) as avg_wind_speed,
                SUM(rain) as total_rainfall,
                MAX(UV) as max_uv,
                AVG(UV) as avg_uv,
                MAX(lightning_strike_count) as max_lightning_strikes,
                SUM(lightning_strike_count) as total_lightning_strikes,
                MAX(pm10_0) as max_pm10,
                AVG(pm10_0) as avg_pm10
            FROM archive
            WHERE dateTime >= {week3_start_time} AND dateTime <= {week3_end_time}
        """
        
        current_df = pd.read_sql(current_query, engine)
        previous_df = pd.read_sql(previous_query, engine)
        week3_df = pd.read_sql(week3_query, engine)
        
        # Process current week data
        current_data = None
        if not current_df.empty:
            current_data = {
                'week_start': week_start.strftime('%Y-%m-%d'),
                'week_end': week_end.strftime('%Y-%m-%d'),
                'min_temp': round((current_df['min_temp'].iloc[0] - 32) * 5/9, 1) if current_df['min_temp'].iloc[0] is not None else None,
                'max_temp': round((current_df['max_temp'].iloc[0] - 32) * 5/9, 1) if current_df['max_temp'].iloc[0] is not None else None,
                'avg_temp': round((current_df['avg_temp'].iloc[0] - 32) * 5/9, 1) if current_df['avg_temp'].iloc[0] is not None else None,
                'min_humidity': int(current_df['min_humidity'].iloc[0]) if current_df['min_humidity'].iloc[0] is not None else None,
                'max_humidity': int(current_df['max_humidity'].iloc[0]) if current_df['max_humidity'].iloc[0] is not None else None,
                'avg_humidity': round(current_df['avg_humidity'].iloc[0], 1) if current_df['avg_humidity'].iloc[0] is not None else None,
                'min_pressure': round(current_df['min_pressure'].iloc[0] * 33.8639, 1) if current_df['min_pressure'].iloc[0] is not None else None,
                'max_pressure': round(current_df['max_pressure'].iloc[0] * 33.8639, 1) if current_df['max_pressure'].iloc[0] is not None else None,
                'avg_pressure': round(current_df['avg_pressure'].iloc[0] * 33.8639, 1) if current_df['avg_pressure'].iloc[0] is not None else None,
                'max_wind_gust': round(current_df['max_wind_gust'].iloc[0] * 1.60934, 1) if current_df['max_wind_gust'].iloc[0] is not None else None,
                'max_wind_gust_direction': get_wind_gust_direction(engine, start_time, end_time),
                'avg_wind_speed': round(current_df['avg_wind_speed'].iloc[0] * 1.60934, 1) if current_df['avg_wind_speed'].iloc[0] is not None else None,
                'total_rainfall': round(current_df['total_rainfall'].iloc[0] * 25.4, 1) if current_df['total_rainfall'].iloc[0] is not None else 0,
                'max_uv': int(current_df['max_uv'].iloc[0]) if current_df['max_uv'].iloc[0] is not None else None,
                'avg_uv': calculate_daylight_uv_average(engine, start_time, end_time, week_start, week_end, current_df['avg_uv'].iloc[0]),
                'max_lightning_strikes': int(current_df['max_lightning_strikes'].iloc[0]) if current_df['max_lightning_strikes'].iloc[0] is not None else 0,
                'total_lightning_strikes': int(current_df['total_lightning_strikes'].iloc[0]) if current_df['total_lightning_strikes'].iloc[0] is not None else 0,
                'max_pm10': int(current_df['max_pm10'].iloc[0]) if current_df['max_pm10'].iloc[0] is not None else None,
                'avg_pm10': round(current_df['avg_pm10'].iloc[0], 1) if current_df['avg_pm10'].iloc[0] is not None else None
            }
        
        # Process previous week data
        previous_data = None
        if not previous_df.empty:
            previous_data = {
                'week_start': previous_week_start.strftime('%Y-%m-%d'),
                'week_end': previous_week_end.strftime('%Y-%m-%d'),
                'min_temp': round((previous_df['min_temp'].iloc[0] - 32) * 5/9, 1) if previous_df['min_temp'].iloc[0] is not None else None,
                'max_temp': round((previous_df['max_temp'].iloc[0] - 32) * 5/9, 1) if previous_df['max_temp'].iloc[0] is not None else None,
                'avg_temp': round((previous_df['avg_temp'].iloc[0] - 32) * 5/9, 1) if previous_df['avg_temp'].iloc[0] is not None else None,
                'min_humidity': int(previous_df['min_humidity'].iloc[0]) if previous_df['min_humidity'].iloc[0] is not None else None,
                'max_humidity': int(previous_df['max_humidity'].iloc[0]) if previous_df['max_humidity'].iloc[0] is not None else None,
                'avg_humidity': round(previous_df['avg_humidity'].iloc[0], 1) if previous_df['avg_humidity'].iloc[0] is not None else None,
                'min_pressure': round(previous_df['min_pressure'].iloc[0] * 33.8639, 1) if previous_df['min_pressure'].iloc[0] is not None else None,
                'max_pressure': round(previous_df['max_pressure'].iloc[0] * 33.8639, 1) if previous_df['max_pressure'].iloc[0] is not None else None,
                'avg_pressure': round(previous_df['avg_pressure'].iloc[0] * 33.8639, 1) if previous_df['avg_pressure'].iloc[0] is not None else None,
                'max_wind_gust': round(previous_df['max_wind_gust'].iloc[0] * 1.60934, 1) if previous_df['max_wind_gust'].iloc[0] is not None else None,
                'max_wind_gust_direction': get_wind_gust_direction(engine, previous_start_time, previous_end_time),
                'avg_wind_speed': round(previous_df['avg_wind_speed'].iloc[0] * 1.60934, 1) if previous_df['avg_wind_speed'].iloc[0] is not None else None,
                'total_rainfall': round(previous_df['total_rainfall'].iloc[0] * 25.4, 1) if previous_df['total_rainfall'].iloc[0] is not None else 0,
                'max_uv': int(previous_df['max_uv'].iloc[0]) if previous_df['max_uv'].iloc[0] is not None else None,
                'avg_uv': calculate_daylight_uv_average(engine, previous_start_time, previous_end_time, previous_week_start, previous_week_end, previous_df['avg_uv'].iloc[0]),
                'max_lightning_strikes': int(previous_df['max_lightning_strikes'].iloc[0]) if previous_df['max_lightning_strikes'].iloc[0] is not None else 0,
                'total_lightning_strikes': int(previous_df['total_lightning_strikes'].iloc[0]) if previous_df['total_lightning_strikes'].iloc[0] is not None else 0,
                'max_pm10': int(previous_df['max_pm10'].iloc[0]) if previous_df['max_pm10'].iloc[0] is not None else None,
                'avg_pm10': round(previous_df['avg_pm10'].iloc[0], 1) if previous_df['avg_pm10'].iloc[0] is not None else None
            }
        
        # Process trends data
        trends_data = None
        if not current_df.empty and not previous_df.empty and not week3_df.empty:
            # Calculate daylight UV averages for all three weeks
            current_avg_uv = calculate_daylight_uv_average(engine, start_time, end_time, week_start, week_end, current_df['avg_uv'].iloc[0])
            previous_avg_uv = calculate_daylight_uv_average(engine, previous_start_time, previous_end_time, previous_week_start, previous_week_end, previous_df['avg_uv'].iloc[0])
            week3_avg_uv = calculate_daylight_uv_average(engine, week3_start_time, week3_end_time, week3_start, week3_end, week3_df['avg_uv'].iloc[0])
            
            # Process week 1 data (current week)
            week1_data = {
                'min_temp': round((current_df['min_temp'].iloc[0] - 32) * 5/9, 1) if current_df['min_temp'].iloc[0] is not None else None,
                'max_temp': round((current_df['max_temp'].iloc[0] - 32) * 5/9, 1) if current_df['max_temp'].iloc[0] is not None else None,
                'avg_temp': round((current_df['avg_temp'].iloc[0] - 32) * 5/9, 1) if current_df['avg_temp'].iloc[0] is not None else None,
                'min_humidity': int(current_df['min_humidity'].iloc[0]) if current_df['min_humidity'].iloc[0] is not None else None,
                'max_humidity': int(current_df['max_humidity'].iloc[0]) if current_df['max_humidity'].iloc[0] is not None else None,
                'avg_humidity': round(current_df['avg_humidity'].iloc[0], 1) if current_df['avg_humidity'].iloc[0] is not None else None,
                'min_pressure': round(current_df['min_pressure'].iloc[0] * 33.8639, 1) if current_df['min_pressure'].iloc[0] is not None else None,
                'max_pressure': round(current_df['max_pressure'].iloc[0] * 33.8639, 1) if current_df['max_pressure'].iloc[0] is not None else None,
                'avg_pressure': round(current_df['avg_pressure'].iloc[0] * 33.8639, 1) if current_df['avg_pressure'].iloc[0] is not None else None,
                'max_wind_gust': round(current_df['max_wind_gust'].iloc[0] * 1.60934, 1) if current_df['max_wind_gust'].iloc[0] is not None else None,
                'max_wind_gust_direction': get_wind_gust_direction(engine, start_time, end_time),
                'avg_wind_speed': round(current_df['avg_wind_speed'].iloc[0] * 1.60934, 1) if current_df['avg_wind_speed'].iloc[0] is not None else None,
                'total_rainfall': round(current_df['total_rainfall'].iloc[0] * 25.4, 1) if current_df['total_rainfall'].iloc[0] is not None else 0,
                'max_uv': int(current_df['max_uv'].iloc[0]) if current_df['max_uv'].iloc[0] is not None else None,
                'avg_uv': current_avg_uv,
                'max_lightning_strikes': int(current_df['max_lightning_strikes'].iloc[0]) if current_df['max_lightning_strikes'].iloc[0] is not None else 0,
                'total_lightning_strikes': int(current_df['total_lightning_strikes'].iloc[0]) if current_df['total_lightning_strikes'].iloc[0] is not None else 0,
                'max_pm10': int(current_df['max_pm10'].iloc[0]) if current_df['max_pm10'].iloc[0] is not None else None,
                'avg_pm10': round(current_df['avg_pm10'].iloc[0], 1) if current_df['avg_pm10'].iloc[0] is not None else None
            }
            
            # Process week 2 data (previous week)
            week2_data = {
                'min_temp': round((previous_df['min_temp'].iloc[0] - 32) * 5/9, 1) if previous_df['min_temp'].iloc[0] is not None else None,
                'max_temp': round((previous_df['max_temp'].iloc[0] - 32) * 5/9, 1) if previous_df['max_temp'].iloc[0] is not None else None,
                'avg_temp': round((previous_df['avg_temp'].iloc[0] - 32) * 5/9, 1) if previous_df['avg_temp'].iloc[0] is not None else None,
                'min_humidity': int(previous_df['min_humidity'].iloc[0]) if previous_df['min_humidity'].iloc[0] is not None else None,
                'max_humidity': int(previous_df['max_humidity'].iloc[0]) if previous_df['max_humidity'].iloc[0] is not None else None,
                'avg_humidity': round(previous_df['avg_humidity'].iloc[0], 1) if previous_df['avg_humidity'].iloc[0] is not None else None,
                'min_pressure': round(previous_df['min_pressure'].iloc[0] * 33.8639, 1) if previous_df['min_pressure'].iloc[0] is not None else None,
                'max_pressure': round(previous_df['max_pressure'].iloc[0] * 33.8639, 1) if previous_df['max_pressure'].iloc[0] is not None else None,
                'avg_pressure': round(previous_df['avg_pressure'].iloc[0] * 33.8639, 1) if previous_df['avg_pressure'].iloc[0] is not None else None,
                'max_wind_gust': round(previous_df['max_wind_gust'].iloc[0] * 1.60934, 1) if previous_df['max_wind_gust'].iloc[0] is not None else None,
                'max_wind_gust_direction': get_wind_gust_direction(engine, previous_start_time, previous_end_time),
                'avg_wind_speed': round(previous_df['avg_wind_speed'].iloc[0] * 1.60934, 1) if previous_df['avg_wind_speed'].iloc[0] is not None else None,
                'total_rainfall': round(previous_df['total_rainfall'].iloc[0] * 25.4, 1) if previous_df['total_rainfall'].iloc[0] is not None else 0,
                'max_uv': int(previous_df['max_uv'].iloc[0]) if previous_df['max_uv'].iloc[0] is not None else None,
                'avg_uv': previous_avg_uv,
                'max_lightning_strikes': int(previous_df['max_lightning_strikes'].iloc[0]) if previous_df['max_lightning_strikes'].iloc[0] is not None else 0,
                'total_lightning_strikes': int(previous_df['total_lightning_strikes'].iloc[0]) if previous_df['total_lightning_strikes'].iloc[0] is not None else 0,
                'max_pm10': int(previous_df['max_pm10'].iloc[0]) if previous_df['max_pm10'].iloc[0] is not None else None,
                'avg_pm10': round(previous_df['avg_pm10'].iloc[0], 1) if previous_df['avg_pm10'].iloc[0] is not None else None
            }
            
            # Process week 3 data
            week3_data = {
                'min_temp': round((week3_df['min_temp'].iloc[0] - 32) * 5/9, 1) if week3_df['min_temp'].iloc[0] is not None else None,
                'max_temp': round((week3_df['max_temp'].iloc[0] - 32) * 5/9, 1) if week3_df['max_temp'].iloc[0] is not None else None,
                'avg_temp': round((week3_df['avg_temp'].iloc[0] - 32) * 5/9, 1) if week3_df['avg_temp'].iloc[0] is not None else None,
                'min_humidity': int(week3_df['min_humidity'].iloc[0]) if week3_df['min_humidity'].iloc[0] is not None else None,
                'max_humidity': int(week3_df['max_humidity'].iloc[0]) if week3_df['max_humidity'].iloc[0] is not None else None,
                'avg_humidity': round(week3_df['avg_humidity'].iloc[0], 1) if week3_df['avg_humidity'].iloc[0] is not None else None,
                'min_pressure': round(week3_df['min_pressure'].iloc[0] * 33.8639, 1) if week3_df['min_pressure'].iloc[0] is not None else None,
                'max_pressure': round(week3_df['max_pressure'].iloc[0] * 33.8639, 1) if week3_df['max_pressure'].iloc[0] is not None else None,
                'avg_pressure': round(week3_df['avg_pressure'].iloc[0] * 33.8639, 1) if week3_df['avg_pressure'].iloc[0] is not None else None,
                'max_wind_gust': round(week3_df['max_wind_gust'].iloc[0] * 1.60934, 1) if week3_df['max_wind_gust'].iloc[0] is not None else None,
                'max_wind_gust_direction': get_wind_gust_direction(engine, week3_start_time, week3_end_time),
                'avg_wind_speed': round(week3_df['avg_wind_speed'].iloc[0] * 1.60934, 1) if week3_df['avg_wind_speed'].iloc[0] is not None else None,
                'total_rainfall': round(week3_df['total_rainfall'].iloc[0] * 25.4, 1) if week3_df['total_rainfall'].iloc[0] is not None else 0,
                'max_uv': int(week3_df['max_uv'].iloc[0]) if week3_df['max_uv'].iloc[0] is not None else None,
                'avg_uv': week3_avg_uv,
                'max_lightning_strikes': int(week3_df['max_lightning_strikes'].iloc[0]) if week3_df['max_lightning_strikes'].iloc[0] is not None else 0,
                'total_lightning_strikes': int(week3_df['total_lightning_strikes'].iloc[0]) if week3_df['total_lightning_strikes'].iloc[0] is not None else 0,
                'max_pm10': int(week3_df['max_pm10'].iloc[0]) if week3_df['max_pm10'].iloc[0] is not None else None,
                'avg_pm10': round(week3_df['avg_pm10'].iloc[0], 1) if week3_df['avg_pm10'].iloc[0] is not None else None
            }
            
            # Calculate trends
            def calculate_trend(current, previous, threshold=0.1):
                if current is None or previous is None or previous == 0:
                    return 'stable'
                change = abs(current - previous) / abs(previous)
                if change < threshold:
                    return 'stable'
                return 'up' if current > previous else 'down'
            
            trends_data = {
                'current_week': week1_data,
                'previous_week': week2_data,
                'week3': week3_data,
                'trends': {
                    'avg_temp': calculate_trend(week1_data['avg_temp'], week2_data['avg_temp']),
                    'avg_humidity': calculate_trend(week1_data['avg_humidity'], week2_data['avg_humidity']),
                    'avg_pressure': calculate_trend(week1_data['avg_pressure'], week2_data['avg_pressure']),
                    'avg_wind_speed': calculate_trend(week1_data['avg_wind_speed'], week2_data['avg_wind_speed']),
                    'total_rainfall': calculate_trend(week1_data['total_rainfall'], week2_data['total_rainfall']),
                    'avg_uv': calculate_trend(week1_data['avg_uv'], week2_data['avg_uv']),
                    'total_lightning_strikes': calculate_trend(week1_data['total_lightning_strikes'], week2_data['total_lightning_strikes']),
                    'avg_pm10': calculate_trend(week1_data['avg_pm10'], week2_data['avg_pm10'])
                }
            }
        
        # Create cache data
        cache_data = {
            'timestamp': now,
            'current': current_data,
            'previous': previous_data,
            'trends': trends_data,
            'last_updated': datetime.now().strftime('%d-%m-%Y %H:%M:%S')
        }
        
        # Write to cache file
        with open(WEEKLY_STATS_CACHE_PATH, 'w') as f:
            json.dump(cache_data, f)
        
        print(f"Weekly stats cache generated successfully at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        return True
        
    except Exception as e:
        print(f"Error generating weekly stats cache: {e}")
        return False

def get_sunrise_sunset_times(date):
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Get sunrise and sunset times for a specific date using the sunrise-sunset.org API.
    Description:
    	Fetches sunrise and sunset times for the specified date using the sunrise-sunset.org API.
    	The times are converted to Brisbane timezone and returned as timezone-aware datetime objects.
    	If the API call fails or returns invalid data, None values are returned for both times.
    Args:
        date (datetime.date): The date for which to fetch sunrise and sunset times.
    Returns:
        tuple: A tuple containing (sunrise_time, sunset_time) as timezone-aware datetime objects, or (None, None) if an error occurs.
    Raises:
        Exception: When API request fails or data parsing errors occur.
    """
    try:
        url = f"https://api.sunrise-sunset.org/json?lat={MY_LAT}&lng={MY_LNG}&date={date.strftime('%Y-%m-%d')}&tzid=Australia/Brisbane"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        if data['status'] == 'OK' and data['results']:
            # Parse sunrise and sunset times
            sunrise_str = data['results']['sunrise']
            sunset_str = data['results']['sunset']
            
            # Convert to datetime objects in Brisbane timezone
            brisbane_tz = pytz.timezone('Australia/Brisbane')
            
            # Parse the time strings (format: "6:15:23 AM")
            def parse_time_string(time_str):
                # Remove timezone info if present and parse
                time_str = time_str.split(' ')[0] + ' ' + time_str.split(' ')[1]
                time_obj = datetime.strptime(time_str, '%I:%M:%S %p')
                # Combine with the date
                combined = datetime.combine(date, time_obj.time())
                return brisbane_tz.localize(combined)
            
            sunrise_time = parse_time_string(sunrise_str)
            sunset_time = parse_time_string(sunset_str)
            
            return sunrise_time, sunset_time
        else:
            return None, None
    except Exception as e:
        print(f"Error fetching sunrise/sunset times for {date}: {e}")
        return None, None

def calculate_daylight_uv_average(engine, start_time, end_time, week_start, week_end, fallback_avg=None):
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Calculate average UV index only during daylight hours for a given week period.
    Description:
    	Retrieves UV data from the database for the specified time period and filters it to only include
    	measurements taken during daylight hours (between sunrise and sunset). This provides a more accurate
    	representation of UV exposure during active hours. If no daylight data is available, falls back to
    	the provided fallback average or returns None.
    Args:
        engine (sqlalchemy.engine.Engine): Database engine for querying weather data.
        start_time (int): Unix timestamp for the start of the time period.
        end_time (int): Unix timestamp for the end of the time period.
        week_start (datetime): Start date of the week for sunrise/sunset calculations.
        week_end (datetime): End date of the week for sunrise/sunset calculations.
        fallback_avg (float, optional): Fallback average UV value if daylight calculation fails. Defaults to None.
    Returns:
        int: Average UV index during daylight hours, rounded to nearest whole number, or None if no data available.
    Raises:
        Exception: When database query fails or UV calculation errors occur.
    """
    try:
        # Get all UV data for the week with timestamps
        uv_query = f"""
            SELECT dateTime, UV
            FROM archive
            WHERE dateTime >= {start_time} AND dateTime <= {end_time} AND UV IS NOT NULL
            ORDER BY dateTime ASC
        """
        uv_df = pd.read_sql(uv_query, engine)
        
        if not uv_df.empty:
            # Convert timestamps to datetime
            uv_df['dateTime'] = pd.to_datetime(uv_df['dateTime'], unit='s', utc=True).dt.tz_convert('Australia/Brisbane')
            
            # Filter UV data to only include daylight hours
            daylight_uv_values = []
            
            # Group by date to get sunrise/sunset for each day
            # Convert week_start and week_end to datetime.date objects for the loop
            week_start_date = week_start.date() if hasattr(week_start, 'date') else week_start
            week_end_date = week_end.date() if hasattr(week_end, 'date') else week_end
            
            for date in pd.date_range(start=week_start_date, end=week_end_date, freq='D'):
                sunrise_time, sunset_time = get_sunrise_sunset_times(date.date())
                
                if sunrise_time and sunset_time:
                    # Create timezone-aware datetime objects for day boundaries
                    brisbane_tz = pytz.timezone('Australia/Brisbane')
                    day_start = brisbane_tz.localize(datetime.combine(date.date(), datetime.min.time()))
                    day_end = brisbane_tz.localize(datetime.combine(date.date(), datetime.max.time().replace(microsecond=999999)))
                    
                    # Convert sunrise and sunset times to pandas Timestamp for comparison
                    sunrise_ts = pd.Timestamp(sunrise_time)
                    sunset_ts = pd.Timestamp(sunset_time)
                    
                    day_uv_data = uv_df[
                        (uv_df['dateTime'] >= day_start) & 
                        (uv_df['dateTime'] <= day_end) &
                        (uv_df['dateTime'] >= sunrise_ts) & 
                        (uv_df['dateTime'] <= sunset_ts)
                    ]
                    
                    if not day_uv_data.empty:
                        daylight_uv_values.extend(day_uv_data['UV'].tolist())
            
            # Calculate average of daylight UV values and round to whole number
            if daylight_uv_values:
                return round(sum(daylight_uv_values) / len(daylight_uv_values))
            else:
                # Fallback to the original average if no daylight data
                return round(fallback_avg) if fallback_avg is not None else None
        else:
            # Fallback to the original average if no UV data
            return round(fallback_avg) if fallback_avg is not None else None
    except Exception as e:
        print(f"Error calculating daylight UV average: {e}")
        # Fallback to the original average if calculation fails
        return round(fallback_avg) if fallback_avg is not None else None

def calculate_average_wind_direction(engine, start_time, end_time):
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Calculate the average wind direction for a given time period using vector mathematics.
    Description:
    	Retrieves wind direction data from the database and calculates the average direction using vector math.
    	Wind directions are converted from degrees to x,y components, averaged, then converted back to degrees
    	and finally to compass direction (N, NNE, NE, etc.). This method properly handles the circular nature
    	of wind direction data.
    Args:
        engine (sqlalchemy.engine.Engine): Database engine for querying weather data.
        start_time (int): Unix timestamp for the start of the time period.
        end_time (int): Unix timestamp for the end of the time period.
    Returns:
        str: Average wind direction as a compass direction (N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW), or None if no data available.
    Raises:
        Exception: When database query fails or wind direction calculation errors occur.
    """
    try:
        # Get all wind direction data for the period
        wind_query = f"""
            SELECT windDir
            FROM archive
            WHERE dateTime >= {start_time} AND dateTime <= {end_time} AND windDir IS NOT NULL
        """
        wind_df = pd.read_sql(wind_query, engine)
        
        if not wind_df.empty:
            # Convert degrees to radians and calculate x,y components
            wind_df['radians'] = wind_df['windDir'] * (3.14159 / 180)
            wind_df['x_component'] = wind_df['radians'].apply(lambda x: -1 * math.sin(x))  # Negative because wind direction is "from"
            wind_df['y_component'] = wind_df['radians'].apply(lambda x: -1 * math.cos(x))  # Negative because wind direction is "from"
            
            # Calculate average components
            avg_x = wind_df['x_component'].mean()
            avg_y = wind_df['y_component'].mean()
            
            # Convert back to degrees
            avg_degrees = math.atan2(avg_x, avg_y) * (180 / 3.14159)
            
            # Normalize to 0-360 range
            if avg_degrees < 0:
                avg_degrees += 360
            
            # Convert to compass direction
            directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
            index = round(avg_degrees / 22.5) % 16
            return directions[index]
        else:
            return None
    except Exception as e:
        print(f"Error calculating average wind direction: {e}")
        return None

def get_wind_gust_direction(engine, start_time, end_time):
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Get the wind direction for the maximum wind gust in a given time period.
    Description:
    	Queries the database to find the record with the highest wind gust value within the specified
    	time period and returns the corresponding wind direction. The wind direction is converted from
    	degrees to compass direction (N, NNE, NE, etc.) for easier interpretation.
    Args:
        engine (sqlalchemy.engine.Engine): Database engine for querying weather data.
        start_time (int): Unix timestamp for the start of the time period.
        end_time (int): Unix timestamp for the end of the time period.
    Returns:
        str: Wind direction as a compass direction (N, NNE, NE, ENE, E, ESE, SE, SSE, S, SSW, SW, WSW, W, WNW, NW, NNW), or None if no data available.
    Raises:
        Exception: When database query fails or wind direction calculation errors occur.
    """
    try:
        # Get the wind direction for the maximum wind gust
        gust_query = f"""
            SELECT windDir
            FROM archive
            WHERE dateTime >= {start_time} AND dateTime <= {end_time} AND windGust IS NOT NULL
            ORDER BY windGust DESC
            LIMIT 1
        """
        gust_df = pd.read_sql(gust_query, engine)
        
        if not gust_df.empty and gust_df['windDir'].iloc[0] is not None:
            wind_dir_degrees = gust_df['windDir'].iloc[0]
            directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
            index = round(wind_dir_degrees / 22.5) % 16
            return directions[index]
        else:
            return None
    except Exception as e:
        print(f"Error getting wind gust direction: {e}")
        return None

@app.route('/')
def index():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Render the main index page of the weather application.
    Description:
    	Returns the main HTML template for the weather application's home page.
    	This is the entry point for users accessing the weather dashboard.
    Args:
        None
    Returns:
        str: Rendered HTML template for the index page.
    Raises:
        None
    """
    return render_template('index.html')

@app.route('/dashboard')
def dashboard():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Render the dashboard page of the weather application.
    Description:
    	Returns the HTML template for the weather dashboard page which displays
    	detailed weather information and statistics in a dashboard format.
    Args:
        None
    Returns:
        str: Rendered HTML template for the dashboard page.
    Raises:
        None
    """
    return render_template('dashboard.html')

@app.route('/api/data')
def api_data():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Retrieve weather data from the database for a specified time period.
    Description:
    	Queries the weather database for historical weather data within the specified time period.
    	Supports multiple time periods (24h, 72h, 7d, 28d) and converts all measurements to metric units.
    	Data is returned as JSON with timestamps and various weather parameters including temperature,
    	humidity, pressure, wind, rain, lightning, UV, and cloudbase information.
    Args:
        period (str, optional): Time period for data retrieval. Options: '24h', '72h', '7d', '28d'. Defaults to '24h'.
    Returns:
        json: JSON object containing weather data arrays with timestamps and converted metric values.
    Raises:
        Exception: When database connection fails or query execution errors occur.
    """
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
        SELECT dateTime, inTemp, outTemp, inHumidity, outHumidity, barometer, rain, windSpeed, windGust, windDir, heatIndex, windChill, lightning_strike_count, lightning_distance, luminosity, UV, cloudbase
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
    df['windSpeed'] = df['windSpeed'] * 1.60934  # Convert mph to km/h
    df['windGust'] = df['windGust'] * 1.60934  # Convert mph to km/h
    df['lightning_distance'] = df['lightning_distance'] * 1.60934  # miles to km
    df['rain'] = df['rain'] * 25.4  # Convert inches to mm
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
        'windGust': safe_list(df['windGust']),
        'windDir': safe_list(df['windDir']),
        'heatIndex': safe_list(df['heatIndex'].round(2)),
        'windChill': safe_list(df['windChill'].round(2)),
        'lightning_strike_count': safe_list(df['lightning_strike_count']),
        'lightning_distance': safe_list(df['lightning_distance'].round(2)),
        'luminosity': safe_list(df['luminosity']),
        'uv': safe_list(df['UV'].round(0)),
        'cloudbase': safe_list(df['cloudbase'].round(0)),
    }
    return jsonify(result)

@app.route('/api/training_days')
def api_training_days():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Get the total number of days of weather data available in the database.
    Description:
    	Calculates the span of weather data by finding the first and last timestamps
    	in the archive table and computing the difference in days. This is useful for
    	understanding the historical data coverage available for training or analysis.
    Args:
        None
    Returns:
        json: JSON object containing the number of days of data available.
    Raises:
        Exception: When database connection fails or query execution errors occur.
    """
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
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Retrieve weather forecast data from the local forecasts file.
    Description:
    	Reads weather forecast data from a local JSON file containing pre-generated forecasts.
    	If today's forecast is not available, returns the most recent available forecast.
    	The forecast data is generated by external prediction models and stored locally.
    Args:
        None
    Returns:
        json: JSON object containing forecast data for the current or most recent available date.
    Raises:
        Exception: When forecast file is missing or JSON parsing errors occur.
    """
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
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Retrieve battery status information for weather station sensors using web scraping.
    Description:
    	Uses Selenium WebDriver to log into the Ecowitt weather station dashboard and scrape
    	battery status information for various sensors (console, outdoor sensor, sensor array).
    	Also fetches lightning detector battery status from a local API. Results are cached
    	for 12 hours to reduce load on external services. Battery levels are categorized as
    	'OK' or 'LOW' based on voltage thresholds.
    Args:
        None
    Returns:
        json: JSON object containing battery status for console, outdoor sensor, sensor array, and lightning detector.
    Raises:
        Exception: When web scraping fails, login errors occur, or API requests fail.
    """
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
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Retrieve environmental metrics from the bar area CO2 sensor.
    Description:
    	Fetches real-time environmental data from a local CO2 sensor located in the bar area.
    	Returns temperature, humidity, CO2 levels, and particulate matter (PM2.5, PM10) readings.
    	This data is used to monitor outdoor air quality and environmental conditions.
    Args:
        None
    Returns:
        json: JSON object containing bar area temperature, humidity, CO2, PM2.5, and PM10 readings.
    Raises:
        Exception: When API request to the CO2 sensor fails or data parsing errors occur.
    """
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
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Retrieve current weather condition information from WeatherAPI.com.
    Description:
    	Fetches current weather conditions for Samford, Queensland (closest locality) from the WeatherAPI.com service.
    	Returns the weather condition text description and corresponding icon URL.
    	This provides a standardized weather condition description for display purposes.
    Args:
        None
    Returns:
        json: JSON object containing weather condition text and icon URL, or error information.
    Raises:
        Exception: When API request fails or weather data parsing errors occur.
    """
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
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Fetch and filter Queensland Fire and Emergency Services (QFES) bushfire alerts for the Ferny Grove area.
    Description:
    	Retrieves bushfire alert data from the Queensland Government's public API and filters alerts
    	to only include those relevant to the Ferny Grove area and surrounding suburbs. Results are
    	cached for 30 minutes to reduce API load. Alerts are filtered by checking warning areas,
    	localities, and warning text for matches with predefined suburb names.
    Args:
        None
    Returns:
        json: JSON object containing filtered bushfire alerts with warning levels, titles, publish dates, and locations.
    Raises:
        Exception: When API request fails, data parsing errors occur, or cache operations fail.
    """
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
            'last_updated': datetime.now().strftime('%d-%m-%Y %H:%M:%S')
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
            'last_updated': datetime.now().strftime('%d-%m-%Y %H:%M:%S'),
            'error': str(e)
        })

@app.route('/api/bom_warnings')
def api_bom_warnings():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Fetch Bureau of Meteorology (BOM) weather warnings for Queensland.
    Description:
    	Retrieves weather warnings from the Bureau of Meteorology's XML feed for Queensland.
    	Parses both marine and land warnings, extracting titles, descriptions, links, and publication dates.
    	Results are cached for 6 hours to reduce load on the BOM servers. Warnings are categorized
    	by type (marine or land) for separate display and processing.
    Args:
        None
    Returns:
        json: JSON object containing marine and land warnings with counts and last updated timestamp.
    Raises:
        Exception: When API request fails, XML parsing errors occur, or cache operations fail.
    """
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
        
        # Parse RSS feed structure with item elements
        for item in root.findall('.//item'):
            title_elem = item.find('title')
            link_elem = item.find('link')
            pubDate_elem = item.find('pubDate')
            
            if title_elem is not None:
                title = title_elem.text.strip() if title_elem.text else 'No title'
                link = link_elem.text.strip() if link_elem is not None and link_elem.text else None
                pubDate = pubDate_elem.text.strip() if pubDate_elem is not None and pubDate_elem.text else 'Unknown date'
                
                warning_data = {
                    'title': title,
                    'description': title,  # Use title as description since RSS doesn't have separate description
                    'link': link,
                    'pubDate': pubDate
                }
                
                # Categorize warnings based on title content
                title_lower = title.lower()
                if any(keyword in title_lower for keyword in ['marine', 'wind warning', 'gale', 'storm force', 'hurricane force']):
                    marine_warnings.append(warning_data)
                else:
                    # All other warnings are considered land warnings
                    land_warnings.append(warning_data)
        
        result = {
            'marine_warnings': marine_warnings,
            'land_warnings': land_warnings,
            'marine_count': len(marine_warnings),
            'land_count': len(land_warnings),
            'last_updated': datetime.now().strftime('%d-%m-%Y %H:%M:%S')
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
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Retrieve historical weather records and extreme values from the weather database.
    Description:
    	Queries the weather database to find all-time records including maximum and minimum temperatures,
    	highest humidity, strongest wind gusts, most rainfall in a day, maximum UV index, worst air quality,
    	and most lightning strikes. All values are converted to metric units and include the dates when
    	these records occurred. UV and air quality values include risk level classifications.
    Args:
        None
    Returns:
        json: JSON object containing historical weather records with dates and converted metric values.
    Raises:
        Exception: When database connection fails, query execution errors occur, or data conversion errors occur.
    """
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
            SELECT windGust, windDir, dateTime 
            FROM archive 
            WHERE windGust IS NOT NULL 
            ORDER BY windGust DESC 
            LIMIT 1
        """
        max_wind_gust_df = pd.read_sql(max_wind_gust_query, engine)
        max_wind_gust = None
        max_wind_gust_direction = None
        max_wind_gust_date = None
        if not max_wind_gust_df.empty:
            max_wind_gust = round(max_wind_gust_df['windGust'].iloc[0] * 1.60934, 1)  # Convert mph to km/h
            max_wind_gust_date = pd.to_datetime(max_wind_gust_df['dateTime'].iloc[0], unit='s').strftime('%B %d, %Y')
            
            # Convert wind direction from degrees to compass direction
            wind_dir_degrees = max_wind_gust_df['windDir'].iloc[0]
            if wind_dir_degrees is not None:
                directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
                index = round(wind_dir_degrees / 22.5) % 16
                max_wind_gust_direction = directions[index]
        
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
            'max_wind_gust_direction': max_wind_gust_direction,
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
            'max_wind_gust_direction': None,
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

@app.route('/api/weekly_stats_current')
def api_weekly_stats_current():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Get weather statistics for the previous week (Sunday to Saturday).
    Description:
    	Retrieves cached weekly statistics for the most recent completed week (Sunday to Saturday).
    	If cache is not available or expired, falls back to real-time calculation. Includes minimum,
    	maximum, and average values for temperature, humidity, pressure, wind speed, rainfall, UV index,
    	lightning strikes, and air quality. All values are converted to metric units.
    Args:
        None
    Returns:
        json: JSON object containing weekly weather statistics with converted metric values and date ranges.
    Raises:
        Exception: When cache reading fails or fallback calculation errors occur.
    """
    now = time.time()
    
    # Try to load cache first
    if os.path.exists(WEEKLY_STATS_CACHE_PATH):
        with open(WEEKLY_STATS_CACHE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if now - cache.get('timestamp', 0) < WEEKLY_STATS_CACHE_TTL:
                    if cache.get('current'):
                        return jsonify(cache['current'])
            except Exception:
                pass
    
    # Fallback to original calculation if cache is not available or expired
    engine = create_engine(DB_URI)
    
    try:
        # Calculate the previous week (Sunday to Saturday)
        current_time = datetime.now()
        days_since_saturday = (current_time.weekday() - 5) % 7
        last_saturday = current_time - timedelta(days=days_since_saturday)
        week_start = last_saturday - timedelta(days=6)
        week_end = last_saturday
        
        # Convert to timestamps
        start_time = int(week_start.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
        end_time = int(week_end.replace(hour=23, minute=59, second=59, microsecond=999999).timestamp())
        
        # Query for weekly statistics
        query = f"""
            SELECT 
                MIN(outTemp) as min_temp,
                MAX(outTemp) as max_temp,
                AVG(outTemp) as avg_temp,
                MIN(outHumidity) as min_humidity,
                MAX(outHumidity) as max_humidity,
                AVG(outHumidity) as avg_humidity,
                MIN(barometer) as min_pressure,
                MAX(barometer) as max_pressure,
                AVG(barometer) as avg_pressure,
                MAX(windGust) as max_wind_gust,
                AVG(windSpeed) as avg_wind_speed,
                SUM(rain) as total_rainfall,
                MAX(UV) as max_uv,
                AVG(UV) as avg_uv,
                MAX(lightning_strike_count) as max_lightning_strikes,
                SUM(lightning_strike_count) as total_lightning_strikes,
                MAX(pm10_0) as max_pm10,
                AVG(pm10_0) as avg_pm10
            FROM archive
            WHERE dateTime >= {start_time} AND dateTime <= {end_time}
        """
        
        df = pd.read_sql(query, engine)
        
        if not df.empty:
            # Convert temperature from Fahrenheit to Celsius
            min_temp = round((df['min_temp'].iloc[0] - 32) * 5/9, 1) if df['min_temp'].iloc[0] is not None else None
            max_temp = round((df['max_temp'].iloc[0] - 32) * 5/9, 1) if df['max_temp'].iloc[0] is not None else None
            avg_temp = round((df['avg_temp'].iloc[0] - 32) * 5/9, 1) if df['avg_temp'].iloc[0] is not None else None
            
            # Convert pressure from inHg to hPa
            min_pressure = round(df['min_pressure'].iloc[0] * 33.8639, 1) if df['min_pressure'].iloc[0] is not None else None
            max_pressure = round(df['max_pressure'].iloc[0] * 33.8639, 1) if df['max_pressure'].iloc[0] is not None else None
            avg_pressure = round(df['avg_pressure'].iloc[0] * 33.8639, 1) if df['avg_pressure'].iloc[0] is not None else None
            
            # Convert wind speed from mph to km/h
            max_wind_gust = round(df['max_wind_gust'].iloc[0] * 1.60934, 1) if df['max_wind_gust'].iloc[0] is not None else None
            avg_wind_speed = round(df['avg_wind_speed'].iloc[0] * 1.60934, 1) if df['avg_wind_speed'].iloc[0] is not None else None
            
            # Calculate wind directions
            max_wind_gust_direction = get_wind_gust_direction(engine, start_time, end_time)
            
            # Convert rainfall from inches to mm
            total_rainfall = round(df['total_rainfall'].iloc[0] * 25.4, 1) if df['total_rainfall'].iloc[0] is not None else 0
            
            # Calculate UV stats with daylight filtering and rounding
            max_uv = int(df['max_uv'].iloc[0]) if df['max_uv'].iloc[0] is not None else None
            
            # Calculate average UV only during daylight hours
            avg_uv = calculate_daylight_uv_average(engine, start_time, end_time, week_start, week_end, df['avg_uv'].iloc[0])
            
            result = {
                'week_start': week_start.strftime('%Y-%m-%d'),
                'week_end': week_end.strftime('%Y-%m-%d'),
                'min_temp': min_temp,
                'max_temp': max_temp,
                'avg_temp': avg_temp,
                'min_humidity': int(df['min_humidity'].iloc[0]) if df['min_humidity'].iloc[0] is not None else None,
                'max_humidity': int(df['max_humidity'].iloc[0]) if df['max_humidity'].iloc[0] is not None else None,
                'avg_humidity': round(df['avg_humidity'].iloc[0], 1) if df['avg_humidity'].iloc[0] is not None else None,
                'min_pressure': min_pressure,
                'max_pressure': max_pressure,
                'avg_pressure': avg_pressure,
                'max_wind_gust': max_wind_gust,
                'max_wind_gust_direction': max_wind_gust_direction,
                'avg_wind_speed': avg_wind_speed,
                'total_rainfall': total_rainfall,
                'max_uv': max_uv,
                'avg_uv': avg_uv,
                'max_lightning_strikes': int(df['max_lightning_strikes'].iloc[0]) if df['max_lightning_strikes'].iloc[0] is not None else 0,
                'total_lightning_strikes': int(df['total_lightning_strikes'].iloc[0]) if df['total_lightning_strikes'].iloc[0] is not None else 0,
                'max_pm10': int(df['max_pm10'].iloc[0]) if df['max_pm10'].iloc[0] is not None else None,
                'avg_pm10': round(df['avg_pm10'].iloc[0], 1) if df['avg_pm10'].iloc[0] is not None else None
            }
        else:
            result = {
                'week_start': week_start.strftime('%Y-%m-%d'),
                'week_end': week_end.strftime('%Y-%m-%d'),
                'error': 'No data available for this period'
            }
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error fetching current weekly stats: {e}")
        return jsonify({
            'error': str(e),
            'week_start': 'Unknown',
            'week_end': 'Unknown'
        })

@app.route('/api/weekly_stats_previous')
def api_weekly_stats_previous():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Get weather statistics for the week prior to the previous week (Sunday to Saturday).
    Description:
    	Retrieves cached weekly statistics for the week before the most recent completed week.
    	If cache is not available or expired, falls back to real-time calculation. This provides
    	historical data for comparison with current week statistics. Includes the same metrics
    	as the current week function: temperature, humidity, pressure, wind, rainfall, UV,
    	lightning, and air quality, all converted to metric units.
    Args:
        None
    Returns:
        json: JSON object containing weekly weather statistics with converted metric values and date ranges.
    Raises:
        Exception: When cache reading fails or fallback calculation errors occur.
    """
    now = time.time()
    
    # Try to load cache first
    if os.path.exists(WEEKLY_STATS_CACHE_PATH):
        with open(WEEKLY_STATS_CACHE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if now - cache.get('timestamp', 0) < WEEKLY_STATS_CACHE_TTL:
                    if cache.get('previous'):
                        return jsonify(cache['previous'])
            except Exception:
                pass
    
    # Fallback to original calculation if cache is not available or expired
    engine = create_engine(DB_URI)
    
    try:
        # Calculate the week prior to the previous week (Sunday to Saturday)
        current_time = datetime.now()
        days_since_saturday = (current_time.weekday() - 5) % 7
        last_saturday = current_time - timedelta(days=days_since_saturday)
        previous_week_start = last_saturday - timedelta(days=13)  # 13 days before last Saturday
        previous_week_end = last_saturday - timedelta(days=7)     # 7 days before last Saturday
        
        # Convert to timestamps
        start_time = int(previous_week_start.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
        end_time = int(previous_week_end.replace(hour=23, minute=59, second=59, microsecond=999999).timestamp())
        
        # Query for weekly statistics
        query = f"""
            SELECT 
                MIN(outTemp) as min_temp,
                MAX(outTemp) as max_temp,
                AVG(outTemp) as avg_temp,
                MIN(outHumidity) as min_humidity,
                MAX(outHumidity) as max_humidity,
                AVG(outHumidity) as avg_humidity,
                MIN(barometer) as min_pressure,
                MAX(barometer) as max_pressure,
                AVG(barometer) as avg_pressure,
                MAX(windGust) as max_wind_gust,
                AVG(windSpeed) as avg_wind_speed,
                SUM(rain) as total_rainfall,
                MAX(UV) as max_uv,
                AVG(UV) as avg_uv,
                MAX(lightning_strike_count) as max_lightning_strikes,
                SUM(lightning_strike_count) as total_lightning_strikes,
                MAX(pm10_0) as max_pm10,
                AVG(pm10_0) as avg_pm10
            FROM archive
            WHERE dateTime >= {start_time} AND dateTime <= {end_time}
        """
        
        df = pd.read_sql(query, engine)
        
        if not df.empty:
            # Convert temperature from Fahrenheit to Celsius
            min_temp = round((df['min_temp'].iloc[0] - 32) * 5/9, 1) if df['min_temp'].iloc[0] is not None else None
            max_temp = round((df['max_temp'].iloc[0] - 32) * 5/9, 1) if df['max_temp'].iloc[0] is not None else None
            avg_temp = round((df['avg_temp'].iloc[0] - 32) * 5/9, 1) if df['avg_temp'].iloc[0] is not None else None
            
            # Convert pressure from inHg to hPa
            min_pressure = round(df['min_pressure'].iloc[0] * 33.8639, 1) if df['min_pressure'].iloc[0] is not None else None
            max_pressure = round(df['max_pressure'].iloc[0] * 33.8639, 1) if df['max_pressure'].iloc[0] is not None else None
            avg_pressure = round(df['avg_pressure'].iloc[0] * 33.8639, 1) if df['avg_pressure'].iloc[0] is not None else None
            
            # Convert wind speed from mph to km/h
            max_wind_gust = round(df['max_wind_gust'].iloc[0] * 1.60934, 1) if df['max_wind_gust'].iloc[0] is not None else None
            avg_wind_speed = round(df['avg_wind_speed'].iloc[0] * 1.60934, 1) if df['avg_wind_speed'].iloc[0] is not None else None
            
            # Calculate wind directions
            max_wind_gust_direction = get_wind_gust_direction(engine, start_time, end_time)
            
            # Convert rainfall from inches to mm
            total_rainfall = round(df['total_rainfall'].iloc[0] * 25.4, 1) if df['total_rainfall'].iloc[0] is not None else 0
            
            # Calculate UV stats with daylight filtering and rounding
            max_uv = int(df['max_uv'].iloc[0]) if df['max_uv'].iloc[0] is not None else None
            
            # Calculate average UV only during daylight hours
            avg_uv = calculate_daylight_uv_average(engine, start_time, end_time, previous_week_start, previous_week_end, df['avg_uv'].iloc[0])
            
            result = {
                'week_start': previous_week_start.strftime('%Y-%m-%d'),
                'week_end': previous_week_end.strftime('%Y-%m-%d'),
                'min_temp': min_temp,
                'max_temp': max_temp,
                'avg_temp': avg_temp,
                'min_humidity': int(df['min_humidity'].iloc[0]) if df['min_humidity'].iloc[0] is not None else None,
                'max_humidity': int(df['max_humidity'].iloc[0]) if df['max_humidity'].iloc[0] is not None else None,
                'avg_humidity': round(df['avg_humidity'].iloc[0], 1) if df['avg_humidity'].iloc[0] is not None else None,
                'min_pressure': min_pressure,
                'max_pressure': max_pressure,
                'avg_pressure': avg_pressure,
                'max_wind_gust': max_wind_gust,
                'max_wind_gust_direction': max_wind_gust_direction,
                'avg_wind_speed': avg_wind_speed,
                'total_rainfall': total_rainfall,
                'max_uv': max_uv,
                'avg_uv': avg_uv,
                'max_lightning_strikes': int(df['max_lightning_strikes'].iloc[0]) if df['max_lightning_strikes'].iloc[0] is not None else 0,
                'total_lightning_strikes': int(df['total_lightning_strikes'].iloc[0]) if df['total_lightning_strikes'].iloc[0] is not None else 0,
                'max_pm10': int(df['max_pm10'].iloc[0]) if df['max_pm10'].iloc[0] is not None else None,
                'avg_pm10': round(df['avg_pm10'].iloc[0], 1) if df['avg_pm10'].iloc[0] is not None else None
            }
        else:
            result = {
                'week_start': previous_week_start.strftime('%Y-%m-%d'),
                'week_end': previous_week_end.strftime('%Y-%m-%d'),
                'error': 'No data available for this period'
            }
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error fetching previous weekly stats: {e}")
        return jsonify({
            'error': str(e),
            'week_start': 'Unknown',
            'week_end': 'Unknown'
        })

@app.route('/api/weekly_stats_trends')
def api_weekly_stats_trends():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Get weekly weather statistics and trends comparing current and previous weeks.
    Description:
    	Retrieves cached weekly statistics and trends for the last three completed weeks.
    	If cache is not available or expired, falls back to real-time calculation.
    	Computes trends by comparing current week to previous week, and previous week to the week before.
    	Trends are determined for average temperature, humidity, pressure, wind speed, rainfall, UV,
    	lightning, and air quality. All values are converted to metric units.
    Args:
        None
    Returns:
        json: JSON object containing weekly statistics for current and previous weeks, and trend indicators for each metric.
    Raises:
        Exception: When cache reading fails or fallback calculation errors occur.
    """
    now = time.time()
    
    # Try to load cache first
    if os.path.exists(WEEKLY_STATS_CACHE_PATH):
        with open(WEEKLY_STATS_CACHE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if now - cache.get('timestamp', 0) < WEEKLY_STATS_CACHE_TTL:
                    if cache.get('trends'):
                        return jsonify(cache['trends'])
            except Exception:
                pass
    
    # Fallback to original calculation if cache is not available or expired
    engine = create_engine(DB_URI)
    
    try:
        # Calculate three consecutive weeks
        current_time = datetime.now()
        days_since_saturday = (current_time.weekday() - 5) % 7
        last_saturday = current_time - timedelta(days=days_since_saturday)
        
        # Week 1 (current week - previous week)
        week1_start = last_saturday - timedelta(days=6)
        week1_end = last_saturday
        
        # Week 2 (week prior to previous week)
        week2_start = last_saturday - timedelta(days=13)
        week2_end = last_saturday - timedelta(days=7)
        
        # Week 3 (week prior to week 2)
        week3_start = last_saturday - timedelta(days=20)
        week3_end = last_saturday - timedelta(days=14)
        
        # Get week 1 data (current week)
        week1_start_time = int(week1_start.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
        week1_end_time = int(week1_end.replace(hour=23, minute=59, second=59, microsecond=999999).timestamp())
        
        week1_query = f"""
            SELECT 
                MIN(outTemp) as min_temp,
                MAX(outTemp) as max_temp,
                AVG(outTemp) as avg_temp,
                MIN(outHumidity) as min_humidity,
                MAX(outHumidity) as max_humidity,
                AVG(outHumidity) as avg_humidity,
                MIN(barometer) as min_pressure,
                MAX(barometer) as max_pressure,
                AVG(barometer) as avg_pressure,
                MAX(windGust) as max_wind_gust,
                AVG(windSpeed) as avg_wind_speed,
                SUM(rain) as total_rainfall,
                MAX(UV) as max_uv,
                AVG(UV) as avg_uv,
                MAX(lightning_strike_count) as max_lightning_strikes,
                SUM(lightning_strike_count) as total_lightning_strikes,
                MAX(pm10_0) as max_pm10,
                AVG(pm10_0) as avg_pm10
            FROM archive
            WHERE dateTime >= {week1_start_time} AND dateTime <= {week1_end_time}
        """
        
        # Get week 2 data
        week2_start_time = int(week2_start.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
        week2_end_time = int(week2_end.replace(hour=23, minute=59, second=59, microsecond=999999).timestamp())
        
        week2_query = f"""
            SELECT 
                MIN(outTemp) as min_temp,
                MAX(outTemp) as max_temp,
                AVG(outTemp) as avg_temp,
                MIN(outHumidity) as min_humidity,
                MAX(outHumidity) as max_humidity,
                AVG(outHumidity) as avg_humidity,
                MIN(barometer) as min_pressure,
                MAX(barometer) as max_pressure,
                AVG(barometer) as avg_pressure,
                MAX(windGust) as max_wind_gust,
                AVG(windSpeed) as avg_wind_speed,
                SUM(rain) as total_rainfall,
                MAX(UV) as max_uv,
                AVG(UV) as avg_uv,
                MAX(lightning_strike_count) as max_lightning_strikes,
                SUM(lightning_strike_count) as total_lightning_strikes,
                MAX(pm10_0) as max_pm10,
                AVG(pm10_0) as avg_pm10
            FROM archive
            WHERE dateTime >= {week2_start_time} AND dateTime <= {week2_end_time}
        """
        
        # Get week 3 data
        week3_start_time = int(week3_start.replace(hour=0, minute=0, second=0, microsecond=0).timestamp())
        week3_end_time = int(week3_end.replace(hour=23, minute=59, second=59, microsecond=999999).timestamp())
        
        week3_query = f"""
            SELECT 
                MIN(outTemp) as min_temp,
                MAX(outTemp) as max_temp,
                AVG(outTemp) as avg_temp,
                MIN(outHumidity) as min_humidity,
                MAX(outHumidity) as max_humidity,
                AVG(outHumidity) as avg_humidity,
                MIN(barometer) as min_pressure,
                MAX(barometer) as max_pressure,
                AVG(barometer) as avg_pressure,
                MAX(windGust) as max_wind_gust,
                AVG(windSpeed) as avg_wind_speed,
                SUM(rain) as total_rainfall,
                MAX(UV) as max_uv,
                AVG(UV) as avg_uv,
                MAX(lightning_strike_count) as max_lightning_strikes,
                SUM(lightning_strike_count) as total_lightning_strikes,
                MAX(pm10_0) as max_pm10,
                AVG(pm10_0) as avg_pm10
            FROM archive
            WHERE dateTime >= {week3_start_time} AND dateTime <= {week3_end_time}
        """
        
        week1_df = pd.read_sql(week1_query, engine)
        week2_df = pd.read_sql(week2_query, engine)
        week3_df = pd.read_sql(week3_query, engine)
        
        if not week1_df.empty and not week2_df.empty and not week3_df.empty:
            # Calculate daylight UV averages for all three weeks
            week1_avg_uv = calculate_daylight_uv_average(engine, week1_start_time, week1_end_time, week1_start, week1_end, week1_df['avg_uv'].iloc[0])
            week2_avg_uv = calculate_daylight_uv_average(engine, week2_start_time, week2_end_time, week2_start, week2_end, week2_df['avg_uv'].iloc[0])
            week3_avg_uv = calculate_daylight_uv_average(engine, week3_start_time, week3_end_time, week3_start, week3_end, week3_df['avg_uv'].iloc[0])
            
            # Process week 1 data
            week1_data = {
                'min_temp': round((week1_df['min_temp'].iloc[0] - 32) * 5/9, 1) if week1_df['min_temp'].iloc[0] is not None else None,
                'max_temp': round((week1_df['max_temp'].iloc[0] - 32) * 5/9, 1) if week1_df['max_temp'].iloc[0] is not None else None,
                'avg_temp': round((week1_df['avg_temp'].iloc[0] - 32) * 5/9, 1) if week1_df['avg_temp'].iloc[0] is not None else None,
                'min_humidity': int(week1_df['min_humidity'].iloc[0]) if week1_df['min_humidity'].iloc[0] is not None else None,
                'max_humidity': int(week1_df['max_humidity'].iloc[0]) if week1_df['max_humidity'].iloc[0] is not None else None,
                'avg_humidity': round(week1_df['avg_humidity'].iloc[0], 1) if week1_df['avg_humidity'].iloc[0] is not None else None,
                'min_pressure': round(week1_df['min_pressure'].iloc[0] * 33.8639, 1) if week1_df['min_pressure'].iloc[0] is not None else None,
                'max_pressure': round(week1_df['max_pressure'].iloc[0] * 33.8639, 1) if week1_df['max_pressure'].iloc[0] is not None else None,
                'avg_pressure': round(week1_df['avg_pressure'].iloc[0] * 33.8639, 1) if week1_df['avg_pressure'].iloc[0] is not None else None,
                'max_wind_gust': round(week1_df['max_wind_gust'].iloc[0] * 1.60934, 1) if week1_df['max_wind_gust'].iloc[0] is not None else None,
                'max_wind_gust_direction': get_wind_gust_direction(engine, week1_start_time, week1_end_time),
                'avg_wind_speed': round(week1_df['avg_wind_speed'].iloc[0] * 1.60934, 1) if week1_df['avg_wind_speed'].iloc[0] is not None else None,
                'total_rainfall': round(week1_df['total_rainfall'].iloc[0] * 25.4, 1) if week1_df['total_rainfall'].iloc[0] is not None else 0,
                'max_uv': int(week1_df['max_uv'].iloc[0]) if week1_df['max_uv'].iloc[0] is not None else None,
                'avg_uv': week1_avg_uv,
                'max_lightning_strikes': int(week1_df['max_lightning_strikes'].iloc[0]) if week1_df['max_lightning_strikes'].iloc[0] is not None else 0,
                'total_lightning_strikes': int(week1_df['total_lightning_strikes'].iloc[0]) if week1_df['total_lightning_strikes'].iloc[0] is not None else 0,
                'max_pm10': int(week1_df['max_pm10'].iloc[0]) if week1_df['max_pm10'].iloc[0] is not None else None,
                'avg_pm10': round(week1_df['avg_pm10'].iloc[0], 1) if week1_df['avg_pm10'].iloc[0] is not None else None
            }
            
            # Process week 2 data
            week2_data = {
                'min_temp': round((week2_df['min_temp'].iloc[0] - 32) * 5/9, 1) if week2_df['min_temp'].iloc[0] is not None else None,
                'max_temp': round((week2_df['max_temp'].iloc[0] - 32) * 5/9, 1) if week2_df['max_temp'].iloc[0] is not None else None,
                'avg_temp': round((week2_df['avg_temp'].iloc[0] - 32) * 5/9, 1) if week2_df['avg_temp'].iloc[0] is not None else None,
                'min_humidity': int(week2_df['min_humidity'].iloc[0]) if week2_df['min_humidity'].iloc[0] is not None else None,
                'max_humidity': int(week2_df['max_humidity'].iloc[0]) if week2_df['max_humidity'].iloc[0] is not None else None,
                'avg_humidity': round(week2_df['avg_humidity'].iloc[0], 1) if week2_df['avg_humidity'].iloc[0] is not None else None,
                'min_pressure': round(week2_df['min_pressure'].iloc[0] * 33.8639, 1) if week2_df['min_pressure'].iloc[0] is not None else None,
                'max_pressure': round(week2_df['max_pressure'].iloc[0] * 33.8639, 1) if week2_df['max_pressure'].iloc[0] is not None else None,
                'avg_pressure': round(week2_df['avg_pressure'].iloc[0] * 33.8639, 1) if week2_df['avg_pressure'].iloc[0] is not None else None,
                'max_wind_gust': round(week2_df['max_wind_gust'].iloc[0] * 1.60934, 1) if week2_df['max_wind_gust'].iloc[0] is not None else None,
                'max_wind_gust_direction': get_wind_gust_direction(engine, week2_start_time, week2_end_time),
                'avg_wind_speed': round(week2_df['avg_wind_speed'].iloc[0] * 1.60934, 1) if week2_df['avg_wind_speed'].iloc[0] is not None else None,
                'total_rainfall': round(week2_df['total_rainfall'].iloc[0] * 25.4, 1) if week2_df['total_rainfall'].iloc[0] is not None else 0,
                'max_uv': int(week2_df['max_uv'].iloc[0]) if week2_df['max_uv'].iloc[0] is not None else None,
                'avg_uv': week2_avg_uv,
                'max_lightning_strikes': int(week2_df['max_lightning_strikes'].iloc[0]) if week2_df['max_lightning_strikes'].iloc[0] is not None else 0,
                'total_lightning_strikes': int(week2_df['total_lightning_strikes'].iloc[0]) if week2_df['total_lightning_strikes'].iloc[0] is not None else 0,
                'max_pm10': int(week2_df['max_pm10'].iloc[0]) if week2_df['max_pm10'].iloc[0] is not None else None,
                'avg_pm10': round(week2_df['avg_pm10'].iloc[0], 1) if week2_df['avg_pm10'].iloc[0] is not None else None
            }
            
            # Process week 3 data
            week3_data = {
                'min_temp': round((week3_df['min_temp'].iloc[0] - 32) * 5/9, 1) if week3_df['min_temp'].iloc[0] is not None else None,
                'max_temp': round((week3_df['max_temp'].iloc[0] - 32) * 5/9, 1) if week3_df['max_temp'].iloc[0] is not None else None,
                'avg_temp': round((week3_df['avg_temp'].iloc[0] - 32) * 5/9, 1) if week3_df['avg_temp'].iloc[0] is not None else None,
                'min_humidity': int(week3_df['min_humidity'].iloc[0]) if week3_df['min_humidity'].iloc[0] is not None else None,
                'max_humidity': int(week3_df['max_humidity'].iloc[0]) if week3_df['max_humidity'].iloc[0] is not None else None,
                'avg_humidity': round(week3_df['avg_humidity'].iloc[0], 1) if week3_df['avg_humidity'].iloc[0] is not None else None,
                'min_pressure': round(week3_df['min_pressure'].iloc[0] * 33.8639, 1) if week3_df['min_pressure'].iloc[0] is not None else None,
                'max_pressure': round(week3_df['max_pressure'].iloc[0] * 33.8639, 1) if week3_df['max_pressure'].iloc[0] is not None else None,
                'avg_pressure': round(week3_df['avg_pressure'].iloc[0] * 33.8639, 1) if week3_df['avg_pressure'].iloc[0] is not None else None,
                'max_wind_gust': round(week3_df['max_wind_gust'].iloc[0] * 1.60934, 1) if week3_df['max_wind_gust'].iloc[0] is not None else None,
                'max_wind_gust_direction': get_wind_gust_direction(engine, week3_start_time, week3_end_time),
                'avg_wind_speed': round(week3_df['avg_wind_speed'].iloc[0] * 1.60934, 1) if week3_df['avg_wind_speed'].iloc[0] is not None else None,
                'total_rainfall': round(week3_df['total_rainfall'].iloc[0] * 25.4, 1) if week3_df['total_rainfall'].iloc[0] is not None else 0,
                'max_uv': int(week3_df['max_uv'].iloc[0]) if week3_df['max_uv'].iloc[0] is not None else None,
                'avg_uv': week3_avg_uv,
                'max_lightning_strikes': int(week3_df['max_lightning_strikes'].iloc[0]) if week3_df['max_lightning_strikes'].iloc[0] is not None else 0,
                'total_lightning_strikes': int(week3_df['total_lightning_strikes'].iloc[0]) if week3_df['total_lightning_strikes'].iloc[0] is not None else 0,
                'max_pm10': int(week3_df['max_pm10'].iloc[0]) if week3_df['max_pm10'].iloc[0] is not None else None,
                'avg_pm10': round(week3_df['avg_pm10'].iloc[0], 1) if week3_df['avg_pm10'].iloc[0] is not None else None
            }
            
            # Calculate trends
            def calculate_trend(current, previous, threshold=0.1):
                if current is None or previous is None:
                    return 'flat'
                diff = current - previous
                if abs(diff) <= threshold:
                    return 'flat'
                return 'up' if diff > 0 else 'down'
            
            # Calculate trends for week 1 (comparing to week 2)
            trends_week1 = {
                'avg_temp': calculate_trend(week1_data['avg_temp'], week2_data['avg_temp'], 0.5),
                'avg_humidity': calculate_trend(week1_data['avg_humidity'], week2_data['avg_humidity'], 2.0),
                'avg_pressure': calculate_trend(week1_data['avg_pressure'], week2_data['avg_pressure'], 0.5),
                'avg_wind_speed': calculate_trend(week1_data['avg_wind_speed'], week2_data['avg_wind_speed'], 0.1),
                'total_rainfall': calculate_trend(week1_data['total_rainfall'], week2_data['total_rainfall'], 0.1),
                'avg_uv': calculate_trend(week1_data['avg_uv'], week2_data['avg_uv'], 0.1),
                'total_lightning_strikes': calculate_trend(week1_data['total_lightning_strikes'], week2_data['total_lightning_strikes'], 0),
                'avg_pm10': calculate_trend(week1_data['avg_pm10'], week2_data['avg_pm10'], 0.5)
            }
            
            # Calculate trends for week 2 (comparing to week 3)
            trends_week2 = {
                'avg_temp': calculate_trend(week2_data['avg_temp'], week3_data['avg_temp'], 0.5),
                'avg_humidity': calculate_trend(week2_data['avg_humidity'], week3_data['avg_humidity'], 2.0),
                'avg_pressure': calculate_trend(week2_data['avg_pressure'], week3_data['avg_pressure'], 0.5),
                'avg_wind_speed': calculate_trend(week2_data['avg_wind_speed'], week3_data['avg_wind_speed'], 0.1),
                'total_rainfall': calculate_trend(week2_data['total_rainfall'], week3_data['total_rainfall'], 0.1),
                'avg_uv': calculate_trend(week2_data['avg_uv'], week3_data['avg_uv'], 0.1),
                'total_lightning_strikes': calculate_trend(week2_data['total_lightning_strikes'], week3_data['total_lightning_strikes'], 0),
                'avg_pm10': calculate_trend(week2_data['avg_pm10'], week3_data['avg_pm10'], 0.5)
            }
            
            result = {
                'current_week': {
                    'week_start': week1_start.strftime('%Y-%m-%d'),
                    'week_end': week1_end.strftime('%Y-%m-%d'),
                    **week1_data
                },
                'previous_week': {
                    'week_start': week2_start.strftime('%Y-%m-%d'),
                    'week_end': week2_end.strftime('%Y-%m-%d'),
                    **week2_data
                },
                'trends_current': trends_week1,
                'trends_previous': trends_week2
            }
        else:
            result = {
                'error': 'No data available for trend calculation'
            }
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error fetching weekly stats trends: {e}")
        return jsonify({
            'error': str(e)
        })

@app.route('/api/generate_weekly_cache')
def api_generate_weekly_cache():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Manually trigger generation of weekly statistics cache.
    Description:
    	Endpoint to manually generate the weekly statistics cache. This can be called
    	via cron job or manually when needed. Returns success/failure status.
    Args:
        None
    Returns:
        json: JSON object containing success status and timestamp.
    Raises:
        Exception: When cache generation fails.
    """
    try:
        success = generate_weekly_stats_cache()
        if success:
            return jsonify({
                'success': True,
                'message': 'Weekly stats cache generated successfully',
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to generate weekly stats cache',
                'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            })
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error generating cache: {str(e)}',
            'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        })

@app.route('/api/rainfall_24h')
def api_rainfall_24h():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Get total rainfall for the last 24 hours.
    Description:
    	Queries the weather database to sum all rainfall measurements recorded in the last 24 hours.
    	Converts the total from inches (as stored in the database) to millimeters and returns the result
    	rounded to two decimal places. This provides a quick summary of recent precipitation for display on the dashboard.
    Args:
        None
    Returns:
        json: JSON object containing the total rainfall for the last 24 hours in millimeters.
    Raises:
        Exception: When database connection fails or query execution errors occur.
    """
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
    
    # Convert from inches to millimeters (like all other rainfall functions)
    total_rainfall_mm = total_rainfall * 25.4
    
    return jsonify({'total_rainfall_24h': round(total_rainfall_mm, 2)})

@app.route('/api/weather_24h')
def api_weather_24h():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Get weather statistics for the last 24 hours including max/min temperature, max wind gust, and total rainfall.
    Description:
    	Queries the weather database to get maximum and minimum temperatures, maximum wind gust with direction,
    	and total rainfall for the last 24 hours. All values are converted to metric units and returned as JSON.
    Args:
        None
    Returns:
        json: JSON object containing 24-hour weather statistics with converted metric values.
    Raises:
        Exception: When database connection fails or query execution errors occur.
    """
    engine = create_engine(DB_URI)
    now = datetime.now()
    # Get data for the last 24 hours
    start_time = int((now - timedelta(hours=24)).timestamp())
    end_time = int(now.timestamp())
    
    try:
        # Get maximum temperature
        max_temp_query = f"""
            SELECT outTemp, dateTime 
            FROM archive 
            WHERE dateTime >= {start_time} AND dateTime <= {end_time} AND outTemp IS NOT NULL 
            ORDER BY outTemp DESC 
            LIMIT 1
        """
        max_temp_df = pd.read_sql(max_temp_query, engine)
        max_temp = None
        if not max_temp_df.empty:
            max_temp = round((max_temp_df['outTemp'].iloc[0] - 32) * 5/9, 1)  # Convert F to C
        
        # Get minimum temperature
        min_temp_query = f"""
            SELECT outTemp, dateTime 
            FROM archive 
            WHERE dateTime >= {start_time} AND dateTime <= {end_time} AND outTemp IS NOT NULL 
            ORDER BY outTemp ASC 
            LIMIT 1
        """
        min_temp_df = pd.read_sql(min_temp_query, engine)
        min_temp = None
        if not min_temp_df.empty:
            min_temp = round((min_temp_df['outTemp'].iloc[0] - 32) * 5/9, 1)  # Convert F to C
        
        # Get maximum wind gust with direction
        max_wind_gust_query = f"""
            SELECT windGust, windDir, dateTime 
            FROM archive 
            WHERE dateTime >= {start_time} AND dateTime <= {end_time} AND windGust IS NOT NULL 
            ORDER BY windGust DESC 
            LIMIT 1
        """
        max_wind_gust_df = pd.read_sql(max_wind_gust_query, engine)
        max_wind_gust = None
        max_wind_gust_direction = None
        if not max_wind_gust_df.empty:
            max_wind_gust = round(max_wind_gust_df['windGust'].iloc[0] * 1.60934, 1)  # Convert mph to km/h
            
            # Convert wind direction from degrees to compass direction
            wind_dir_degrees = max_wind_gust_df['windDir'].iloc[0]
            if wind_dir_degrees is not None:
                directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
                index = round(wind_dir_degrees / 22.5) % 16
                max_wind_gust_direction = directions[index]
        
        # Get total rainfall
        rainfall_query = f'''
            SELECT SUM(rain) as total_rainfall
            FROM archive
            WHERE dateTime >= {start_time} AND dateTime <= {end_time}
        '''
        rainfall_df = pd.read_sql(rainfall_query, engine)
        total_rainfall = rainfall_df['total_rainfall'].iloc[0] if not rainfall_df.empty else 0
        total_rainfall_mm = round(total_rainfall * 25.4, 1)  # Convert inches to mm
        
        result = {
            'max_temp_24h': max_temp,
            'min_temp_24h': min_temp,
            'max_wind_gust_24h': max_wind_gust,
            'max_wind_gust_direction_24h': max_wind_gust_direction,
            'total_rainfall_24h': total_rainfall_mm
        }
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error fetching 24-hour weather stats: {e}")
        return jsonify({
            'error': str(e),
            'max_temp_24h': None,
            'min_temp_24h': None,
            'max_wind_gust_24h': None,
            'max_wind_gust_direction_24h': None,
            'total_rainfall_24h': None
        })

@app.route('/api/tides')
def api_tides():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Fetch tide extremes for today and tomorrow from the Stormglass API.
    Description:
    	Retrieves tide extreme data (high and low tides) for the current and next day from the Stormglass API.
    	Converts tide times to Brisbane timezone and sorts them chronologically. Results are cached for 24 hours.
    Args:
        None
    Returns:
        json: JSON object containing tide heights, types, times, and station metadata.
    Raises:
        Exception: When API request fails, data parsing errors occur, or cache operations fail.
    """
    now = time.time()
    today = datetime.now().date().isoformat()
    tomorrow = (datetime.now().date() + timedelta(days=1)).isoformat()
    
    # Try to load cache
    if os.path.exists(TIDES_CACHE_PATH):
        with open(TIDES_CACHE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if cache.get('date') == today and now - cache.get('timestamp', 0) < TIDES_CACHE_TTL:
                    # Add last_updated timestamp to the response
                    tides_data = cache['data'].copy()
                    tides_data['last_updated'] = datetime.fromtimestamp(cache['timestamp']).strftime('%d-%m-%Y %H:%M:%S')
                    return jsonify(tides_data)
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
            'tides': [],
            'last_updated': datetime.now().strftime('%d-%m-%Y %H:%M:%S')
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
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Fetch dam level data for key dams from the Seqwater website using web scraping.
    Description:
    	Uses Selenium WebDriver to scrape dam level data for North Pine, Somerset, and Wivenhoe dams from the Seqwater website.
    	Extracts volume and percentage full for each dam, assigns a color code based on percentage, and caches results for 24 hours.
    	This provides critical water supply information for the Brisbane region.
    Args:
        None
    Returns:
        json: JSON object containing dam names, volumes, percentage full, color codes, and last updated timestamp.
    Raises:
        Exception: When web scraping fails, data parsing errors occur, or cache operations fail.
    """
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
                                        color = '#006400'  # Dark Green
                                    
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
                    'last_updated': datetime.now().strftime('%d-%m-%Y %H:%M:%S')
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
            'last_updated': datetime.now().strftime('%d-%m-%Y %H:%M:%S')
        })

@app.route('/api/comfort_levels')
def api_comfort_levels():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Get the latest comfort level data including dew point, heat index, wind chill, and calculated feels like temperature.
    Description:
    	Queries the weather database for the most recent dew point, heat index, and wind chill values.
    	Calculates the "feels like" temperature based on these values and determines the comfort rating.
    	Returns the data with comfort level classification and corresponding image filename.
    Args:
        None
    Returns:
        json: JSON object containing comfort level data with calculated feels like temperature and rating.
    Raises:
        Exception: When database connection fails or query execution errors occur.
    """
    try:
        engine = create_engine(DB_URI)
        
        # Get the latest comfort level data
        query = """
            SELECT dewpoint, heatindex, windchill, outTemp, outHumidity, windSpeed
            FROM archive
            WHERE dewpoint IS NOT NULL AND heatindex IS NOT NULL AND windchill IS NOT NULL
            ORDER BY dateTime DESC
            LIMIT 1
        """
        
        df = pd.read_sql(query, engine)
        
        if df.empty:
            return jsonify({
                'error': 'No comfort level data available',
                'dew_point': None,
                'heat_index': None,
                'wind_chill': None,
                'feels_like': None,
                'comfort_rating': None,
                'comfort_image': None
            })
        
        # Convert temperature values from Fahrenheit to Celsius
        dew_point = round((df['dewpoint'].iloc[0] - 32) * 5/9, 1) if df['dewpoint'].iloc[0] is not None else None
        heat_index = round((df['heatindex'].iloc[0] - 32) * 5/9, 1) if df['heatindex'].iloc[0] is not None else None
        wind_chill = round((df['windchill'].iloc[0] - 32) * 5/9, 1) if df['windchill'].iloc[0] is not None else None
        current_temp = round((df['outTemp'].iloc[0] - 32) * 5/9, 1) if df['outTemp'].iloc[0] is not None else None
        humidity = df['outHumidity'].iloc[0] if df['outHumidity'].iloc[0] is not None else None
        wind_speed = round(df['windSpeed'].iloc[0] * 1.60934, 1) if df['windSpeed'].iloc[0] is not None else None  # Convert mph to km/h
        
        # Calculate "feels like" temperature
        # Use heat index if it's higher than current temp (hot conditions)
        # Use wind chill if it's lower than current temp (cold conditions)
        # Otherwise use current temperature
        feels_like = current_temp
        if heat_index is not None and heat_index > current_temp:
            feels_like = heat_index
        elif wind_chill is not None and wind_chill < current_temp:
            feels_like = wind_chill
        
        # Determine comfort rating based on feels like temperature
        comfort_rating = None
        comfort_image = None
        
        if feels_like is not None:
            if feels_like < 6:
                comfort_rating = 'Freezing'
                comfort_image = 'Freezing.png'
            elif feels_like < 15:
                comfort_rating = 'Cold'
                comfort_image = 'Cold.png'
            elif feels_like < 20:
                comfort_rating = 'Chilly'
                comfort_image = 'Chilly.png'
            elif feels_like < 26:
                comfort_rating = 'Perfect'
                comfort_image = 'Perfect.png'
            elif feels_like < 31:
                comfort_rating = 'Warm'
                comfort_image = 'Warm.png'
            elif feels_like < 36:
                comfort_rating = 'Hot'
                comfort_image = 'Hot.png'
            else:
                comfort_rating = 'Boiling'
                comfort_image = 'Boiling.png'
        
        result = {
            'dew_point': dew_point,
            'heat_index': heat_index,
            'wind_chill': wind_chill,
            'feels_like': feels_like,
            'comfort_rating': comfort_rating,
            'comfort_image': comfort_image,
            'current_temp': current_temp,
            'humidity': humidity,
            'wind_speed': wind_speed
        }
        
        return jsonify(result)
        
    except Exception as e:
        print(f"Error fetching comfort levels data: {e}")
        return jsonify({
            'error': str(e),
            'dew_point': None,
            'heat_index': None,
            'wind_chill': None,
            'feels_like': None,
            'comfort_rating': None,
            'comfort_image': None
        })

@app.route('/api/download_csv')
def api_download_csv():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Download weather data as a CSV file for a specified period.
    Description:
    	Allows users to download historical weather data as a CSV file for the last 7 or 30 days.
    	Queries the database for the specified period, converts timestamps to local time, and returns
    	the data as a downloadable CSV file with appropriate headers.
    Args:
        period (str, optional): Time period for data download. Options: '7d', '30d'. Defaults to '7d'.
    Returns:
        Response: Flask response object containing the CSV file for download.
    Raises:
        Exception: When database query fails, CSV generation errors occur, or invalid period is specified.
    """
    try:
        period = request.args.get('period', '7d')
        
        # Calculate the date range based on the period
        now = datetime.now()
        if period == '7d':
            start_date = now - timedelta(days=7)
        elif period == '30d':
            start_date = now - timedelta(days=30)
        else:
            return jsonify({'error': 'Invalid period specified'}), 400
        
        # Convert to Unix timestamps
        start_time = int(start_date.timestamp())
        end_time = int(now.timestamp())
        
        # Create database connection
        engine = create_engine(DB_URI)
        
        # Query all data from archive table for the specified period
        query = f"""
            SELECT dateTime,appTemp,barometer,cloudbase,co2,dewpoint,heatindex,humidex,inDewpoint,inHumidity,inTemp,lightning_distance,lightning_strike_count,luminosity,maxSolarRad,outHumidity,outTemp,pm10_0,pressure,rain,rainRate,UV,windchill,windDir,windGust,windGustDir,windrun,windSpeed,conditions
            FROM archive
            WHERE dateTime >= {start_time} AND dateTime <= {end_time}
            ORDER BY dateTime ASC
        """
        
        # Execute query and get data as DataFrame
        df = pd.read_sql(query, engine)
        
        if df.empty:
            return jsonify({'error': 'No data found for the specified period'}), 404
        
        # Convert Unix timestamps to readable datetime
        df['dateTime'] = pd.to_datetime(df['dateTime'], unit='s', utc=True).dt.tz_convert('Australia/Brisbane')
        
        # Generate filename with current date and period
        filename = f"weather_data_{period}_{now.strftime('%Y%m%d_%H%M%S')}.csv"
        
        # Create CSV content
        csv_content = df.to_csv(index=False)
        
        # Create response with CSV content
        response = app.response_class(
            response=csv_content,
            status=200,
            mimetype='text/csv'
        )
        response.headers['Content-Disposition'] = f'attachment; filename={filename}'
        
        return response
        
    except Exception as e:
        print(f"Error generating CSV download: {e}")
        return jsonify({'error': 'Failed to generate CSV download'}), 500

@app.route('/api/capital_cities')
def api_capital_cities():
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Get weather forecast data for all Australian capital cities using WeatherAPI.
    Description:
    	Fetches current weather and forecast data for all Australian capital cities including
    	Brisbane, Sydney, Canberra, Melbourne, Adelaide, Perth, Darwin, and Hobart.
    	Returns current conditions, hourly forecast, and daily min/max temperatures.
    	Results are cached for 1 hour to reduce API load and improve performance.
    Args:
        None
    Returns:
        json: JSON object containing weather data for all capital cities.
    Raises:
        Exception: When API requests fail or data parsing errors occur.
    """
    now = time.time()
    
    # Try to load cache first
    if os.path.exists(CAPITAL_CITIES_CACHE_PATH):
        with open(CAPITAL_CITIES_CACHE_PATH, 'r') as f:
            try:
                cache = json.load(f)
                if now - cache.get('timestamp', 0) < CAPITAL_CITIES_CACHE_TTL:
                    return jsonify(cache['data'])
            except Exception:
                pass
    
    try:
        if not WAPI_KEY:
            return jsonify({
                'error': 'WeatherAPI key not configured',
                'cities': []
            })
        
        # Australian capital cities
        cities = [
            'Brisbane', 'Sydney', 'Canberra', 'Melbourne', 
            'Adelaide', 'Perth', 'Darwin', 'Hobart'
        ]
        
        cities_data = []
        
        for city in cities:
            try:
                # Make API request to WeatherAPI
                url = f"http://api.weatherapi.com/v1/forecast.json?key={WAPI_KEY}&q={city}&days=1&aqi=no&alerts=no"
                response = requests.get(url, timeout=10)
                response.raise_for_status()
                data = response.json()
                
                # Extract current hour data (get the current hour from the hourly forecast)
                current_time = datetime.now()
                current_hour = current_time.hour
                
                # Find the current hour in the hourly forecast
                current_hour_data = None
                if 'forecast' in data and 'forecastday' in data['forecast'] and len(data['forecast']['forecastday']) > 0:
                    hourly_data = data['forecast']['forecastday'][0].get('hour', [])
                    for hour_data in hourly_data:
                        hour_time = datetime.strptime(hour_data['time'], '%Y-%m-%d %H:%M')
                        if hour_time.hour == current_hour:
                            current_hour_data = hour_data
                            break
                
                # If current hour not found, use the first available hour
                if not current_hour_data and hourly_data:
                    current_hour_data = hourly_data[0]
                
                # Extract daily forecast data
                daily_data = None
                if 'forecast' in data and 'forecastday' in data['forecast'] and len(data['forecast']['forecastday']) > 0:
                    daily_data = data['forecast']['forecastday'][0]['day']
                
                city_data = {
                    'name': city,
                    'current_hour': {
                        'time': current_hour_data['time'] if current_hour_data else None,
                        'temp_c': current_hour_data['temp_c'] if current_hour_data else None,
                        'condition': {
                            'text': current_hour_data['condition']['text'] if current_hour_data else None,
                            'icon': current_hour_data['condition']['icon'] if current_hour_data else None
                        }
                    } if current_hour_data else None,
                    'daily_forecast': {
                        'maxtemp_c': daily_data['maxtemp_c'] if daily_data else None,
                        'mintemp_c': daily_data['mintemp_c'] if daily_data else None,
                        'condition': {
                            'text': daily_data['condition']['text'] if daily_data else None,
                            'icon': daily_data['condition']['icon'] if daily_data else None
                        }
                    } if daily_data else None
                }
                
                cities_data.append(city_data)
                
            except Exception as e:
                print(f"Error fetching data for {city}: {e}")
                # Add error data for this city
                cities_data.append({
                    'name': city,
                    'error': str(e),
                    'current_hour': None,
                    'daily_forecast': None
                })
        
        result = {
            'cities': cities_data,
            'last_updated': datetime.now().strftime('%d-%m-%Y %H:%M:%S')
        }
        
        # Cache the result
        cache_data = {
            'timestamp': now,
            'data': result
        }
        with open(CAPITAL_CITIES_CACHE_PATH, 'w') as f:
            json.dump(cache_data, f)
        
        return jsonify(result)
        
    except Exception as e:
        # Return cached data if available, otherwise empty result
        if os.path.exists(CAPITAL_CITIES_CACHE_PATH):
            with open(CAPITAL_CITIES_CACHE_PATH, 'r') as f:
                try:
                    cache = json.load(f)
                    return jsonify(cache['data'])
                except Exception:
                    pass
        
        print(f"Error fetching capital cities data: {e}")
        return jsonify({
            'error': str(e),
            'cities': []
        })

if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5000) 