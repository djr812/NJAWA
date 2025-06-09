# NJAWA - Not Just Another Weather App

NJAWA is a modern, full-stack weather dashboard and prediction system that leverages data from your own Personal Weather Station (PWS). It provides real-time and historical weather metrics, as well as AI-powered weather predictions, all visualized in a professional web interface.

## Features
- **Live Weather Dashboard:**
  - Inside & outside temperature (°C)
  - Humidity (inside & outside)
  - Barometric pressure
  - Rainfall
  - Wind speed & direction
  - All metrics updated every 5 minutes
- **AI Weather Forecasting:**
  - Weather condition predictions (Clear, Cloudy, Rain, Storm)
  - Wind condition predictions (Calm, Light Breeze, Stiff Breeze, Windy, High Winds)
  - Temperature range predictions (min/max)
  - Model trained on historical weather data
  - Retrain option available via command line
- **Beautiful UI:**
  - Responsive, modern web app using Flask, Bootstrap, and Plotly.js
  - Interactive weather condition cards with visual indicators
  - Real-time updates and historical data visualization

## Data Source
- **Local PWS:**
  - Data is collected from your own Personal Weather Station (PWS)
  - The PWS is managed by [WeeWX](https://weewx.com/), which stores weather data in a local MySQL database
  - This app consumes the data directly from the `weewx` MySQL database

## AI Prediction Models
- **Random Forest Classifiers & Regressors:**
  - Weather condition prediction using RandomForestClassifier
  - Wind condition prediction using RandomForestClassifier
  - Temperature range prediction using RandomForestRegressor
  - Models trained on historical weather data with features including:
    - Pressure and pressure changes
    - Temperature and temperature changes
    - Humidity and humidity changes
    - Rolling rainfall
    - Average wind speed
  - Models can be retrained using the `--retrain` flag
  - Training data period can be adjusted using the `--days` parameter

## Setup & Installation
1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd weather_predictor
   ```
2. **Install dependencies:**
   - Create a virtual environment (recommended):
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```
   - Install required packages:
     ```bash
     pip install -r requirements.txt
     ```
3. **Configure environment variables:**
   - Copy `.env.example` to `.env` and fill in your MySQL credentials:
     ```
     WEEWX_DB_USER=weewx
     WEEWX_DB_PASSWORD=your_password_here
     WEEWX_DB_HOST=localhost
     WEEWX_DB_NAME=weewx
     ```
4. **Run the AI forecaster:**
   ```bash
   # Run with default settings (60 days of training data)
   python ai_forecaster.py
   
   # Retrain the models
   python ai_forecaster.py --retrain
   
   # Use custom training period (e.g., 90 days)
   python ai_forecaster.py --days 90
   ```
5. **Start the web app:**
   ```bash
   python app.py
   ```
6. **View in your browser:**
   - Go to [http://localhost:5000](http://localhost:5000)

## Acknowledgements
- **WeeWX** for PWS data management
- **scikit-learn** for machine learning models
- **Plotly.js** and **Bootstrap** for frontend visualization

---
NJAWA: Not Just Another Weather App — because your weather should be local, live, and smart. 