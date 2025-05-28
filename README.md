# NJAWA - Not Just Another Weather App

NJAWA is a modern, full-stack weather dashboard and prediction system that leverages data from your own Personal Weather Station (PWS). It provides real-time and historical weather metrics, as well as AI-powered temperature predictions, all visualized in a professional web interface.

## Features
- **Live Weather Dashboard:**
  - Inside & outside temperature (°C)
  - Humidity (inside & outside)
  - Barometric pressure
  - Rainfall
  - Wind speed & direction
  - All metrics updated every 5 minutes
- **Forecast Overlay:**
  - Daily temperature predictions (min/max) using the Prophet AI model
  - Compare actuals to previous day's forecast
- **Beautiful UI:**
  - Responsive, modern web app using Flask, Bootstrap, and Plotly.js

## Data Source
- **Local PWS:**
  - Data is collected from your own Personal Weather Station (PWS)
  - The PWS is managed by [WeeWX](https://weewx.com/), which stores weather data in a local MySQL database
  - This app consumes the data directly from the `weewx` MySQL database

## Prediction Model
- **Prophet:**
  - Daily temperature predictions are generated using [Prophet](https://github.com/facebook/prophet), an open-source time series forecasting tool developed by Meta
  - Prophet is used under the [MIT License](https://github.com/facebook/prophet/blob/main/LICENSE)
  - "Prophet is open source software released by Meta under the MIT license."

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
4. **Run the predictor (to generate forecasts):**
   ```bash
   python predictor.py
   ```
5. **Start the web app:**
   ```bash
   python app.py
   ```
6. **View in your browser:**
   - Go to [http://localhost:5000](http://localhost:5000)

## Acknowledgements
- **Prophet** by Meta, used under the MIT License
- **WeeWX** for PWS data management
- **Plotly.js** and **Bootstrap** for frontend visualization

---
NJAWA: Not Just Another Weather App — because your weather should be local, live, and smart. 