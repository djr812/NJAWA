# NJAWA - Not Just Another Weather App

NJAWA is a comprehensive, full-stack weather dashboard and prediction system that leverages data from your own Personal Weather Station (PWS). It provides real-time and historical weather metrics, AI-powered weather predictions, environmental monitoring, and extensive weather information from multiple sources, all visualized in a professional web interface.

## 🌟 Features

### **Live Weather Dashboard**
- **Real-time Meteorological Data:**
  - Inside & outside temperature (°C)
  - Humidity (inside & outside)
  - Barometric pressure with trends
  - Rainfall (current and 24-hour totals)
  - Wind speed, direction, and gusts
  - UV index and solar radiation
  - Lightning strike detection and distance
  - Cloudbase height
  - Heat index and wind chill
  - All metrics updated every 5 minutes

### **AI Weather Forecasting**
- **Advanced Machine Learning Predictions:**
  - Weather condition predictions (Clear, Cloudy, Rain, Storm, Electrical Storm)
  - Wind condition predictions (Calm, Light Breeze, Stiff Breeze, Windy, High Winds)
  - Temperature range predictions (min/max with confidence levels)
  - Rain probability predictions with confidence
  - Lightning probability predictions
  - Model trained on historical weather data using Random Forest algorithms
  - Retrain option available via command line
  - Confidence levels and prediction ranges for all forecasts

### **Historical Weather Records Ticker**
- **Continuous Scrolling Display:**
  - Maximum and minimum temperatures with dates
  - Highest humidity levels with corresponding temperatures
  - Most powerful wind gusts with directions
  - Highest daily rainfall amounts
  - Maximum UV levels with risk ratings
  - Worst PM10 pollution levels with air quality ratings
  - Most lightning strikes in 24-hour periods
  - **24-hour Weather Summary:** High/low temperatures, max wind gust with direction, and total rainfall for the past 24 hours
  - Smooth scrolling animation with seamless looping

### **Environmental Monitoring**
- **Air Quality & Environmental Sensors:**
  - CO2 levels with air quality ratings (Good to Hazardous)
  - PM2.5 particulate matter monitoring
  - PM10 particulate matter with air quality scale
  - Bar area temperature and humidity monitoring
  - Real-time environmental data from local sensors

### **Weather Station Management**
- **Battery Status Monitoring:**
  - WS3900 Console battery status
  - WH32 Temperature/Humidity sensor battery
  - WS69 Rain/Wind/Solar sensor array battery
  - WH57 Lightning sensor battery
  - Automated battery level checking every 12 hours
  - Visual battery status indicators

### **Live Weather Camera & Timelapse**
- **Visual Weather Monitoring:**
  - Live weather camera with SE aspect view
  - Automatic sunrise/sunset detection for camera operation
  - Timelapse video playback
  - Camera status indicators (online/offline)
  - Clickable camera modal for full-size viewing
  - Automatic image refresh every 5 minutes

### **Emergency & Weather Alerts**
- **QFD (Queensland Fire Department) Alerts:**
  - Real-time bushfire alerts for Ferny Grove area
  - Filtered alerts for surrounding suburbs
  - Warning levels, titles, and locations
  - Automatic updates every 30 minutes

- **BOM (Bureau of Meteorology) Warnings:**
  - Marine weather warnings
  - Land weather warnings
  - Automatic updates every 6 hours
  - Warning descriptions and links

### **Tidal Information**
- **Coastal Weather Data:**
  - High and low tide times
  - Tide heights and types
  - Station information (name, source, distance)
  - Future/past tide indicators
  - Automatic updates every hour

### **Dam Levels Monitoring**
- **Water Resource Information:**
  - Southeast Queensland dam levels
  - Dam capacity percentages
  - Last updated timestamps
  - Web-scraped data from Seqwater

### **Local Weather Widgets**
- **Regional Weather Information:**
  - Mitchelton (North Brisbane) weather
  - Birkdale (Redland Bay) weather
  - Mooloolaba (Sunshine Coast) weather
  - Surfers Paradise (Gold Coast) weather
  - Powered by WeatherAPI.com

### **Weekly Statistics & Trends**
- **Comprehensive Weather Analysis:**
  - Current week statistics (Sunday to Saturday)
  - Previous week statistics for comparison
  - Trend analysis across multiple weeks
  - Temperature, humidity, pressure, wind, rainfall, UV, lightning, and air quality trends
  - Visual trend indicators (up/down/flat)
  - Daylight UV filtering for accurate averages

### **Data Export & Download**
- **CSV Data Export:**
  - Download weather data for last 7 days
  - Download weather data for last 30 days
  - Complete weather station data in CSV format
  - Automatic filename generation with timestamps

### **Beautiful & Responsive UI**
- **Modern Web Interface:**
  - Responsive design using Flask, Bootstrap, and Plotly.js
  - Interactive weather condition cards with visual indicators
  - Real-time updates and historical data visualization
  - Dark/light theme toggle
  - Mobile-responsive layout
  - Interactive charts and graphs
  - Smooth animations and transitions

## 🔌 API Endpoints

The application provides comprehensive REST API endpoints for data access:

### **Core Weather Data**
- `/api/data` - Historical weather data for specified periods (24h, 72h, 7d, 28d)
- `/api/weather_condition` - Current weather condition from WeatherAPI.com
- `/api/forecast` - AI-generated weather forecasts
- `/api/training_days` - Total days of weather data available

### **Statistics & Records**
- `/api/top_stats` - All-time weather records and extreme values
- `/api/weather_24h` - 24-hour weather statistics (max/min temps, max wind gust, total rainfall)
- `/api/rainfall_24h` - Total rainfall for the last 24 hours
- `/api/weekly_stats_current` - Weather statistics for the current week
- `/api/weekly_stats_previous` - Weather statistics for the previous week
- `/api/weekly_stats_trends` - Trend analysis across multiple weeks

### **Environmental & Monitoring**
- `/api/battery` - Weather station component battery status
- `/api/bar_metrics` - Environmental metrics from CO2 sensor (temperature, humidity, CO2, PM2.5, PM10)

### **External Services**
- `/api/qfd_alerts` - Queensland Fire Department bushfire alerts
- `/api/bom_warnings` - Bureau of Meteorology weather warnings
- `/api/tides` - Tidal information from Stormglass API
- `/api/dam-levels` - Southeast Queensland dam levels

### **Data Export**
- `/api/download_csv` - Download weather data as CSV file (7d or 30d periods)

## 🤖 AI Prediction Models

### **Machine Learning Implementation**
- **Random Forest Classifiers & Regressors:**
  - Weather condition prediction using RandomForestClassifier
  - Wind condition prediction using RandomForestClassifier
  - Temperature range prediction using RandomForestRegressor
  - Rain probability prediction
  - Lightning probability prediction

### **Training Features**
- Pressure and pressure changes
- Temperature and temperature changes
- Humidity and humidity changes
- Rolling rainfall calculations
- Average wind speed
- Historical pattern recognition

### **Model Management**
- Models can be retrained using the `--retrain` flag
- Training data period can be adjusted using the `--days` parameter
- Automatic daily forecast generation at 2:00 AM
- Confidence levels and prediction ranges for all forecasts

## 📊 Data Source & Infrastructure

### **Local Weather Station**
- **Ecowitt Weather Station Array:**
  - WS3900 Console
  - WH32 External Temperature/Humidity Sensor
  - WS69 Rain/Wind/Solar Sensor Array
  - WH57 Lightning Sensor
  - HP10 Weather Cam
  - WH45 CO2/Pollution AQI Sensor

### **Data Management**
- **WeeWX Integration:**
  - Data collected and managed by WeeWX
  - Stored in local MySQL database
  - Automatic data conversion to metric units
  - Timezone handling (Australia/Brisbane)

### **External APIs**
- **WeatherAPI.com** - Current weather conditions and local weather widgets
- **Stormglass API** - Tidal information
- **Sunrise-sunset.org** - Sunrise/sunset times
- **Queensland Government APIs** - Bushfire alerts
- **Bureau of Meteorology** - Weather warnings

## 🚀 Setup & Installation

### **1. Clone the Repository**
```bash
git clone <your-repo-url>
cd weather_predictor
```

### **2. Install Dependencies**
```bash
# Create a virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate

# Install required packages
pip install -r requirements.txt
```

### **3. Configure Environment Variables**
Copy `.env.example` to `.env` and fill in your credentials:
```env
# Database Configuration
WEEWX_DB_PASSWORD=your_password_here

# API Keys
WAPI_KEY=your_weatherapi_key
SG_KEY=your_stormglass_key

# Ecowitt Credentials
ECOWITT_EMAIL=your_ecowitt_email
ECOWITT_PASSWORD=your_ecowitt_password
```

### **4. Run the AI Forecaster**
```bash
# Run with default settings (60 days of training data)
python ai_forecaster.py

# Retrain the models
python ai_forecaster.py --retrain

# Use custom training period (e.g., 90 days)
python ai_forecaster.py --days 90
```

### **5. Start the Web Application**
```bash
python app.py
```

### **6. Access the Dashboard**
- Go to [http://localhost:5000](http://localhost:5000)
- The dashboard will automatically start updating with live data

## 📈 Recent Updates & Enhancements

### **Major Feature Additions**
- **24-Hour Weather Ticker**: Comprehensive 24-hour weather summary in scrolling ticker
- **Environmental Monitoring**: CO2, PM2.5, and PM10 air quality monitoring
- **Battery Status Monitoring**: Real-time battery status for all weather station components
- **Emergency Alerts**: QFD bushfire alerts and BOM weather warnings
- **Tidal Information**: Live tidal data with station information
- **Dam Levels**: Southeast Queensland dam level monitoring
- **Weekly Statistics**: Comprehensive weekly weather analysis with trends
- **CSV Data Export**: Download weather data for analysis
- **Local Weather Widgets**: Regional weather information for surrounding areas

### **Technical Improvements**
- Enhanced API endpoints with comprehensive error handling
- Improved data caching for external services
- Better responsive design for mobile devices
- Enhanced weather condition determination
- Improved ticker animation and seamless looping
- Better timezone handling and date formatting
- Enhanced chart visualizations and overlays

### **User Experience Enhancements**
- Dark/light theme toggle
- Interactive weather camera modal
- Smooth animations and transitions
- Better error handling and loading states
- Improved mobile responsiveness
- Enhanced accessibility features

## 🏗️ Architecture

### **Backend (Flask)**
- RESTful API endpoints
- Database integration with MySQL
- External API integrations
- Data processing and conversion
- Caching mechanisms
- Web scraping capabilities

### **Frontend (JavaScript/HTML/CSS)**
- Responsive Bootstrap interface
- Interactive Plotly.js charts
- Real-time data updates
- Theme management
- Modal dialogs and overlays

### **Data Processing**
- Pandas for data manipulation
- SQLAlchemy for database operations
- Automated data conversion (imperial to metric)
- Timezone handling
- Statistical calculations

## 🙏 Acknowledgements

- **WeeWX** for PWS data management
- **scikit-learn** for machine learning models
- **Plotly.js** and **Bootstrap** for frontend visualization
- **WeatherAPI.com** for weather condition data and local widgets
- **Stormglass** for tidal information
- **Queensland Government** for bushfire alert data
- **Bureau of Meteorology** for weather warnings
- **Seqwater** for dam level information

---

**NJAWA: Not Just Another Weather App** — because your weather should be local, live, smart, and comprehensive.

*Located in Ferny Grove, Brisbane, Queensland, Australia* 