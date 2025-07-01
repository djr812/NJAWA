#!/usr/bin/env python3
"""
Weekly Statistics Cache Generator

Author: David Rogers
Email: dave@djrogers.net.au

This script generates the weekly statistics cache for the weather predictor application.
It should be run weekly (e.g., Sunday at 1 AM) via cron job to pre-generate the data
and improve page load performance.

Usage:
    python3 generate_weekly_cache.py

Cron example:
    0 1 * * 0 /usr/bin/python3 /path/to/weather_predictor/generate_weekly_cache.py
"""

import os
import sys
import json
import time
from datetime import datetime, timedelta
import pandas as pd
from sqlalchemy import create_engine

# Add the current directory to the Python path so we can import from app.py
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import the cache generation function from app.py
try:
    from app import generate_weekly_stats_cache
except ImportError:
    print("Error: Could not import generate_weekly_stats_cache from app.py")
    print("Make sure this script is in the same directory as app.py")
    sys.exit(1)

def main():
    """Main function to generate the weekly statistics cache."""
    print(f"Starting weekly statistics cache generation at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # Generate the cache
        success = generate_weekly_stats_cache()
        
        if success:
            print(f"Weekly statistics cache generated successfully at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            sys.exit(0)
        else:
            print(f"Failed to generate weekly statistics cache at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            sys.exit(1)
            
    except Exception as e:
        print(f"Error generating weekly statistics cache: {e}")
        print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        sys.exit(1)

if __name__ == "__main__":
    main() 