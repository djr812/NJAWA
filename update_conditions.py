#!/usr/bin/env python3

import os
import sys
import requests
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database configuration
DB_USER = 'weewx'
DB_PASSWORD = os.getenv('WEEWX_DB_PASSWORD')
DB_HOST = '10.1.1.126'
DB_NAME = 'weewx'
DB_URI = f'mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}'

# WeatherAPI configuration
WAPI_KEY = os.getenv('WAPI_KEY')
LOCATION = 'Samford'  # Using Samford as the location

def get_weather_condition():
    """Get the current weather condition code from WeatherAPI."""
    try:
        response = requests.get(
            f'http://api.weatherapi.com/v1/current.json',
            params={
                'key': WAPI_KEY,
                'q': LOCATION,
                'aqi': 'no'
            }
        )
        response.raise_for_status()  # Raise an exception for bad status codes
        data = response.json()
        return data['current']['condition']['code']
    except requests.exceptions.RequestException as e:
        print(f"Error fetching weather data: {e}", file=sys.stderr)
        sys.exit(1)
    except (KeyError, ValueError) as e:
        print(f"Error parsing weather data: {e}", file=sys.stderr)
        sys.exit(1)

def update_database(condition_code):
    """Update the weewx database with the current condition code."""
    try:
        engine = create_engine(DB_URI)
        with engine.connect() as conn:
            # Get the latest dateTime value
            result = conn.execute(text("SELECT MAX(dateTime) FROM archive"))
            latest_dateTime = result.scalar()
            
            if latest_dateTime is None:
                print("No records found in the archive table", file=sys.stderr)
                sys.exit(1)
            
            # Update the conditions column for the latest record
            conn.execute(
                text("UPDATE archive SET conditions = :code WHERE dateTime = :dateTime"),
                {"code": condition_code, "dateTime": latest_dateTime}
            )
            conn.commit()
            
    except Exception as e:
        print(f"Error updating database: {e}", file=sys.stderr)
        sys.exit(1)

def main():
    """Main function to update weather conditions."""
    try:
        condition_code = get_weather_condition()
        update_database(condition_code)
        print(f"Successfully updated conditions to code: {condition_code}")
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 