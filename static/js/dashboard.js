document.addEventListener('DOMContentLoaded', function() {
    fetchAndUpdateAll();
    setInterval(fetchAndUpdateAll, 5 * 60 * 1000); // Update every 5 minutes
});

let latestData = null;
let latestForecast = null;

function fetchAndUpdateAll() {
    fetch('/api/data')
        .then(res => res.json())
        .then(data => {
            latestData = data;
            updateInsideTempGraph(data);
            updateOutsideTempGraph(data);
            updateHumidityGraph(data);
            updatePressureGraph(data);
            updateRainfallGraph(data);
            updateWindGraph(data);
        });
    fetch('/api/forecast')
        .then(res => res.json())
        .then(forecast => {
            latestForecast = forecast;
            updateForecastOnOutsideTemp(forecast);
        });
}

function updateInsideTempGraph(data) {
    Plotly.newPlot('inside-temp-graph', [{
        x: data.dateTime,
        y: data.inTemp,
        type: 'scatter',
        mode: 'lines',
        name: 'Inside Temp',
        line: { color: '#ff9800' }
    }], {
        margin: { t: 20 },
        yaxis: { title: '°C' },
        xaxis: { title: 'Time' },
        height: 300
    }, {responsive: true});
}

function updateOutsideTempGraph(data) {
    let traces = [{
        x: data.dateTime,
        y: data.outTemp,
        type: 'scatter',
        mode: 'lines',
        name: 'Outside Temp',
        line: { color: '#2196f3' }
    }];
    // If forecast is loaded, add min/max lines
    if (latestForecast && latestForecast.predicted_min_temp !== undefined) {
        let forecastDate = latestForecast.date;
        // Find all x values for the forecast date
        let xVals = data.dateTime.filter(dt => dt.startsWith(forecastDate));
        traces.push({
            x: xVals,
            y: xVals.map(() => latestForecast.predicted_min_temp),
            type: 'scatter',
            mode: 'lines',
            name: 'Forecast Min',
            line: { dash: 'dash', color: '#4caf50' }
        });
        traces.push({
            x: xVals,
            y: xVals.map(() => latestForecast.predicted_max_temp),
            type: 'scatter',
            mode: 'lines',
            name: 'Forecast Max',
            line: { dash: 'dash', color: '#f44336' }
        });
    }
    Plotly.newPlot('outside-temp-graph', traces, {
        margin: { t: 20 },
        yaxis: { title: '°C' },
        xaxis: { title: 'Time' },
        height: 300
    }, {responsive: true});
}

function updateForecastOnOutsideTemp(forecast) {
    // This is handled in updateOutsideTempGraph
    if (latestData) updateOutsideTempGraph(latestData);
}

function updateHumidityGraph(data) {
    Plotly.newPlot('humidity-graph', [
        {
            x: data.dateTime,
            y: data.inHumidity,
            type: 'scatter',
            mode: 'lines',
            name: 'Inside Humidity',
            line: { color: '#00bcd4' }
        },
        {
            x: data.dateTime,
            y: data.outHumidity,
            type: 'scatter',
            mode: 'lines',
            name: 'Outside Humidity',
            line: { color: '#8bc34a' }
        }
    ], {
        margin: { t: 20 },
        yaxis: { title: '%' },
        xaxis: { title: 'Time' },
        height: 300
    }, {responsive: true});
}

function updatePressureGraph(data) {
    Plotly.newPlot('pressure-graph', [{
        x: data.dateTime,
        y: data.barometer,
        type: 'scatter',
        mode: 'lines',
        name: 'Barometric Pressure',
        line: { color: '#9c27b0' }
    }], {
        margin: { t: 20 },
        yaxis: { title: 'hPa' },
        xaxis: { title: 'Time' },
        height: 300
    }, {responsive: true});
}

function updateRainfallGraph(data) {
    Plotly.newPlot('rainfall-graph', [{
        x: data.dateTime,
        y: data.rain,
        type: 'bar',
        name: 'Rainfall',
        marker: { color: '#2196f3' }
    }], {
        margin: { t: 20 },
        yaxis: { title: 'mm' },
        xaxis: { title: 'Time' },
        height: 300
    }, {responsive: true});
}

function updateWindGraph(data) {
    Plotly.newPlot('wind-graph', [
        {
            x: data.dateTime,
            y: data.windSpeed,
            type: 'scatter',
            mode: 'lines',
            name: 'Wind Speed (m/s)',
            line: { color: '#607d8b' },
            yaxis: 'y1'
        },
        {
            x: data.dateTime,
            y: data.windDir,
            type: 'scatter',
            mode: 'markers',
            name: 'Wind Direction (°)',
            marker: { color: '#ffeb3b', size: 6 },
            yaxis: 'y2'
        }
    ], {
        margin: { t: 20 },
        yaxis: { title: 'Wind Speed (m/s)', side: 'left' },
        yaxis2: {
            title: 'Wind Dir (°)',
            overlaying: 'y',
            side: 'right',
            range: [0, 360]
        },
        xaxis: { title: 'Time' },
        height: 300
    }, {responsive: true});
} 