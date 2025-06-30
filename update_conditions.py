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
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Get the current weather condition code from WeatherAPI.com for the Samford location.
    Description:
    	Makes an API request to WeatherAPI.com to retrieve the current weather condition code
    	for the Samford area. This function fetches real-time weather data and extracts the
    	condition code which represents the current weather state (e.g., clear, cloudy, rain, etc.).
    	The condition code is used to update the local weather database with standardized
    	weather condition information.
    Args:
        None
    Returns:
        int: Weather condition code from WeatherAPI.com representing the current weather state.
    Raises:
        requests.exceptions.RequestException: When the API request fails due to network issues,
            invalid API key, or server errors.
        KeyError: When the API response doesn't contain the expected 'current' or 'condition' data.
        ValueError: When the API response cannot be parsed as valid JSON.
        SystemExit: When any error occurs, the program exits with status code 1.
    """
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
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Update the weewx database with the current weather condition code for the latest record.
    Description:
    	Connects to the weewx MySQL database and updates the 'conditions' column for the most
    	recent weather record with the provided condition code. This function first queries
    	the archive table to find the maximum dateTime value (most recent record), then
    	updates that record's conditions field with the weather condition code obtained
    	from WeatherAPI.com. This ensures the local weather database has standardized
    	weather condition information that can be used for display and analysis.
    Args:
        condition_code (int): The weather condition code to be stored in the database.
    Returns:
        None
    Raises:
        Exception: When database connection fails, query execution errors occur,
            or the archive table is empty.
        SystemExit: When any database error occurs, the program exits with status code 1.
    """
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
    """
    Author:
	    David Rogers
    Email:		
	    dave@djrogers.net.au
    Summary:
	    Main function to orchestrate the weather condition update process.
    Description:
    	Coordinates the weather condition update workflow by first fetching the current
    	weather condition code from WeatherAPI.com, then updating the local weewx database
    	with this information. This function serves as the primary entry point for the
    	weather condition update script and handles the overall execution flow, including
    	error handling and success reporting. The script is designed to be run periodically
    	to keep the local weather database synchronized with current weather conditions.
    Args:
        None
    Returns:
        None
    Raises:
        Exception: When any unexpected error occurs during the weather condition update process.
        SystemExit: When any error occurs, the program exits with status code 1.
    """
    try:
        condition_code = get_weather_condition()
        update_database(condition_code)
        print(f"Successfully updated conditions to code: {condition_code}")
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 