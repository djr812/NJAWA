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
            updateHeatIndexGraph(data);
            updateWindChillGraph(data);
        });
    fetch('/api/forecast')
        .then(res => res.json())
        .then(forecast => {
            latestForecast = forecast;
            updateForecastOnOutsideTemp(forecast);
        });
}

function plotGraph(divId, traces, layout, legendAbove) {
    layout = Object.assign({
        margin: { t: legendAbove ? 60 : 20 },
        autosize: true,
        height: 320,
        xaxis: {
            title: 'Time',
            tickformat: '%H:%M',
            tickangle: -45,
            automargin: true,
            tickformatstops: [
                {
                    dtickrange: [null, 3600000], // below 1hr
                    value: '%H:%M'
                },
                {
                    dtickrange: [3600000, 86400000], // 1hr to 1day
                    value: '%H:%M'
                },
                {
                    dtickrange: [86400000, null], // 1day and up
                    value: '%d/%m/%y'
                }
            ]
        }
    }, layout);
    if (legendAbove) {
        layout.legend = {
            orientation: 'h',
            yanchor: 'bottom',
            y: 1.12,
            xanchor: 'center',
            x: 0.5
        };
    }
    Plotly.newPlot(divId, traces, layout, {responsive: true, displayModeBar: false, useResizeHandler: true});
}

function setOverlay(id, value, unit, decimals = 1) {
    const el = document.getElementById(id);
    if (el) {
        if (value !== null && value !== undefined && !isNaN(value)) {
            el.textContent = `${formatValue(value, decimals)} ${unit}`;
        } else {
            el.textContent = '--';
        }
    }
}

function formatValue(val, decimals) {
    return Number(val).toFixed(decimals);
}

function updateInsideTempGraph(data) {
    plotGraph('inside-temp-graph', [{
        x: data.dateTime,
        y: data.inTemp,
        type: 'scatter',
        mode: 'lines',
        name: 'Inside Temp',
        line: { color: '#ff9800' }
    }], {yaxis: { title: '°C' }});
    setOverlay('inside-temp-overlay', lastValid(data.inTemp), '°C', 1);
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
    let layout = {yaxis: { title: '°C' }};
    let annotations = [];
    if (latestForecast && latestForecast.predicted_min_temp !== undefined) {
        let xStart = data.dateTime[0];
        let xEnd = data.dateTime[data.dateTime.length - 1];
        traces.push({
            x: [xStart, xEnd],
            y: [latestForecast.predicted_min_temp, latestForecast.predicted_min_temp],
            type: 'scatter',
            mode: 'lines',
            name: 'Forecast Min',
            line: { color: '#4caf50', width: 3, dash: 'solid' },
            showlegend: true
        });
        traces.push({
            x: [xStart, xEnd],
            y: [latestForecast.predicted_max_temp, latestForecast.predicted_max_temp],
            type: 'scatter',
            mode: 'lines',
            name: 'Forecast Max',
            line: { color: '#f44336', width: 3, dash: 'solid' },
            showlegend: true
        });
        annotations.push({
            x: xEnd,
            y: latestForecast.predicted_min_temp,
            xref: 'x',
            yref: 'y',
            text: `${latestForecast.predicted_min_temp}°C`,
            showarrow: false,
            font: { color: '#4caf50', size: 14, weight: 'bold' },
            align: 'left',
            xanchor: 'left',
            yanchor: 'middle',
            bgcolor: 'rgba(255,255,255,0.7)',
            bordercolor: '#4caf50',
            borderpad: 2
        });
        annotations.push({
            x: xEnd,
            y: latestForecast.predicted_max_temp,
            xref: 'x',
            yref: 'y',
            text: `${latestForecast.predicted_max_temp}°C`,
            showarrow: false,
            font: { color: '#f44336', size: 14, weight: 'bold' },
            align: 'left',
            xanchor: 'left',
            yanchor: 'middle',
            bgcolor: 'rgba(255,255,255,0.7)',
            bordercolor: '#f44336',
            borderpad: 2
        });
    }
    if (annotations.length) layout.annotations = annotations;
    plotGraph('outside-temp-graph', traces, layout);
    setOverlay('outside-temp-overlay', lastValid(data.outTemp), '°C', 1);
}

function updateForecastOnOutsideTemp(forecast) {
    if (latestData) updateOutsideTempGraph(latestData);
}

function updateHumidityGraph(data) {
    plotGraph('humidity-graph', [
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
        yaxis: { title: '%' },
        legend: {
            orientation: 'v',
            x: 1.05,
            y: 1,
            xanchor: 'left',
            yanchor: 'top'
        }
    }, false);
    setOverlay('humidity-overlay', lastValid(data.outHumidity), '%', 2);
}

function updatePressureGraph(data) {
    plotGraph('pressure-graph', [{
        x: data.dateTime,
        y: data.barometer,
        type: 'scatter',
        mode: 'lines',
        name: 'Barometric Pressure',
        line: { color: '#9c27b0' }
    }], {yaxis: { title: 'hPa' }});
    setOverlay('pressure-overlay', lastValid(data.barometer), 'hPa', 1);
}

function updateRainfallGraph(data) {
    plotGraph('rainfall-graph', [{
        x: data.dateTime,
        y: data.rain,
        type: 'bar',
        name: 'Rainfall',
        marker: { color: '#2196f3' }
    }], {
        yaxis: { title: 'mm', rangemode: 'tozero', zeroline: true, zerolinewidth: 2, zerolinecolor: '#888' }
    });
    setOverlay('rainfall-overlay', lastValid(data.rain), 'mm', 2);
}

function updateWindGraph(data) {
    // Convert wind speed from m/s to km/h
    const windSpeedKmh = data.windSpeed.map(v => v == null ? null : Math.round(v * 3.6 * 100) / 100);
    plotGraph('wind-graph', [
        {
            x: data.dateTime,
            y: windSpeedKmh,
            type: 'scatter',
            mode: 'lines',
            name: 'Wind Speed (km/h)',
            line: { color: '#607d8b' },
            yaxis: 'y1'
        },
        {
            x: data.dateTime,
            y: data.windDir,
            type: 'scatter',
            mode: 'markers',
            name: 'Wind Direction (°)',
            marker: { color: '#f44336', size: 6 }, // red
            yaxis: 'y2'
        }
    ], {
        yaxis: { title: 'Wind Speed (km/h)', side: 'left' },
        yaxis2: {
            title: 'Wind Dir (°)',
            overlaying: 'y',
            side: 'right',
            range: [0, 360],
            tickvals: [0, 90, 180, 270, 360],
            ticktext: ['N', 'E', 'S', 'W', 'N']
        },
        legend: {
            orientation: 'h',
            x: 0,
            y: 1.1,
            xanchor: 'left',
            yanchor: 'bottom'
        }
    }, false);
    setWindOverlay(lastValid(windSpeedKmh), lastValid(data.windDir));
}

function updateHeatIndexGraph(data) {
    plotGraph('heat-index-graph', [{
        x: data.dateTime,
        y: data.heatIndex,
        type: 'scatter',
        mode: 'lines',
        name: 'Heat Index',
        line: { color: '#e65100' }
    }], {yaxis: { title: '°C' }});
    setOverlay('heat-index-overlay', lastValid(data.heatIndex), '°C', 1);
}

function updateWindChillGraph(data) {
    plotGraph('wind-chill-graph', [{
        x: data.dateTime,
        y: data.windChill,
        type: 'scatter',
        mode: 'lines',
        name: 'Wind Chill',
        line: { color: '#0288d1' }
    }], {yaxis: { title: '°C' }});
    setOverlay('wind-chill-overlay', lastValid(data.windChill), '°C', 1);
}

function lastValid(arr) {
    if (!arr || !arr.length) return null;
    for (let i = arr.length - 1; i >= 0; --i) {
        if (arr[i] !== null && arr[i] !== undefined && !isNaN(arr[i])) return arr[i];
    }
    return null;
}

function setWindOverlay(speed, dir) {
    const el = document.getElementById('wind-overlay');
    if (el) {
        if (speed !== null && speed !== undefined && !isNaN(speed) && dir !== null && dir !== undefined && !isNaN(dir)) {
            el.textContent = `From ${degToCompass(dir)} at ${formatValue(speed, 2)} km/h`;
        } else {
            el.textContent = '--';
        }
    }
}

function degToCompass(deg) {
    if (deg === null || deg === undefined || isNaN(deg)) return '--';
    if ((deg >= 337.5 && deg <= 360) || (deg >= 0 && deg < 22.5)) return 'N';
    if (deg >= 22.5 && deg < 67.5) return 'NE';
    if (deg >= 67.5 && deg < 112.5) return 'E';
    if (deg >= 112.5 && deg < 157.5) return 'SE';
    if (deg >= 157.5 && deg < 202.5) return 'S';
    if (deg >= 202.5 && deg < 247.5) return 'SW';
    if (deg >= 247.5 && deg < 292.5) return 'W';
    if (deg >= 292.5 && deg < 337.5) return 'NW';
    return '--';
} 