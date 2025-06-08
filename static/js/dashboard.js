document.addEventListener('DOMContentLoaded', function() {
    fetchAndUpdateAll();
    fetchAndUpdateBattery();  // Initial battery check
    
    // Update all metrics every 5 minutes
    setInterval(fetchAndUpdateAll, 300000);
    
    // Update battery status every 12 hours
    setInterval(fetchAndUpdateBattery, 43200000);
    fetchAndUpdateBarMetrics();
    setInterval(fetchAndUpdateBarMetrics, 5 * 60 * 1000);
    refreshWeatherCamImage();
    setInterval(refreshWeatherCamImage, 5 * 60 * 1000);
    updateWeatherCamTimestamp();
    setInterval(updateWeatherCamTimestamp, 5 * 60 * 1000);

    // Weather Cam Modal functionality
    const weatherCamImg = document.querySelector('.weather-cam-img');
    const modal = document.getElementById('weatherCamModal');
    const modalImg = document.getElementById('modalImage');
    const closeModal = document.querySelector('.close-modal');

    weatherCamImg.addEventListener('click', function() {
        modal.style.display = "block";
        modalImg.src = this.src;
    });

    closeModal.addEventListener('click', function() {
        modal.style.display = "none";
    });

    // Close modal when clicking outside the image
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            modal.style.display = "none";
        }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === "Escape" && modal.style.display === "block") {
            modal.style.display = "none";
        }
    });

    // Hamburger menu period selection
    document.querySelectorAll('.period-option').forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const period = this.getAttribute('data-period');
            if (period && period !== currentPeriod) {
                currentPeriod = period;
                document.querySelectorAll('.period-option').forEach(opt => opt.classList.remove('active'));
                this.classList.add('active');
                fetchAndUpdateAll();
            }
        });
    });
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);
    fetchAndDisplaySunriseSunset();
    scheduleSunriseSunsetUpdate();
});

let latestData = null;
let latestForecast = null;
let currentPeriod = '24h';
let sunriseTime = null;
let sunsetTime = null;

// Color palette
const COLORS = {
    greenBlue: '#2A66B6',
    powderBlue: '#95B4D4',
    tuftsBlue: '#4A87D1',
    fieldDrab: '#6D6425',
    gold: '#F0CD28',
};

function fetchAndUpdateAll() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';

    // Start the timelapse video
    const timelapseVideo = document.getElementById('timelapse-video');
    if (timelapseVideo) {
        timelapseVideo.play().catch(error => {
            console.log('Video autoplay failed:', error);
        });
    }

    // Update timelapse date
    updateTimelapseDate();

    fetch(`${basePath}/api/data?period=${currentPeriod}`)
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
            updateLightningGraph(data);
            updateSolarGraph(data);
            updatePeriodLabels();
        });

    fetch(`${basePath}/api/forecast`)
        .then(res => res.json())
        .then(forecast => {
            latestForecast = forecast;
            updateForecastOnOutsideTemp(forecast);
            updatePredictedWeatherConditionsCard(forecast);
        });

    fetchAndUpdateBarMetrics();
}

function updatePredictedWeatherConditionsCard(forecast) {
    const cardBody = document.getElementById('predicted-weather-conditions-body');
    if (!cardBody) return;
    cardBody.innerHTML = '';
    if (forecast && forecast.ai_forecast) {
        // Sanitize filename: replace spaces and special chars with underscores
        const filename = forecast.ai_forecast.replace(/[^a-zA-Z0-9_-]/g, '_') + '.png';
        const img = document.createElement('img');
        img.src = `static/images/${filename}`;
        img.alt = forecast.ai_forecast;
        cardBody.appendChild(img);
        // Add the ai_forecast text below the image
        const textDiv = document.createElement('div');
        textDiv.className = 'ai-forecast-text mt-3';
        textDiv.style.fontSize = '1.5rem';
        textDiv.style.fontWeight = 'bold';
        textDiv.style.textAlign = 'center';
        textDiv.textContent = forecast.ai_forecast;
        cardBody.appendChild(textDiv);
    }
}

function plotGraph(divId, traces, layout, legendAbove) {
    // Generate fixed 6-hour interval tickvals and ticktext for the x-axis
    if (traces.length && traces[0].x && traces[0].x.length) {
        const xVals = traces[0].x;
        const tickvals = [];
        const ticktext = [];
        if (xVals.length > 0) {
            // Find the first and last timestamps
            const start = new Date(xVals[0].replace(' ', 'T'));
            const end = new Date(xVals[xVals.length - 1].replace(' ', 'T'));
            // Find the first midnight before or at start
            let tick = new Date(start);
            tick.setMinutes(0, 0, 0);
            tick.setHours(0);
            if (tick > start) tick.setDate(tick.getDate() - 1);
            // Generate ticks every 6 hours
            while (tick <= end) {
                const tickStr = tick.getFullYear() + '-' + String(tick.getMonth() + 1).padStart(2, '0') + '-' + String(tick.getDate()).padStart(2, '0') + ' ' + String(tick.getHours()).padStart(2, '0') + ':00:00';
                tickvals.push(tickStr);
                if (tick.getHours() === 0) {
                    ticktext.push(tick.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }));
                } else {
                    ticktext.push(tick.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }));
                }
                tick.setHours(tick.getHours() + 6);
            }
        }
        layout = Object.assign({
            margin: { t: legendAbove ? 60 : 20 },
            autosize: true,
            height: 320,
            xaxis: {
                title: 'Time',
                tickangle: -45,
                automargin: true,
                tickvals: tickvals,
                ticktext: ticktext
            }
        }, layout);
    } else {
        layout = Object.assign({
            margin: { t: legendAbove ? 60 : 20 },
            autosize: true,
            height: 320,
            xaxis: {
                title: 'Time',
                tickangle: -45,
                automargin: true
            }
        }, layout);
    }
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
        line: { color: COLORS.powderBlue }
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
        line: { color: COLORS.greenBlue }
    }];
    let layout = {yaxis: { title: '°C' }};
    let annotations = [];
    if (currentPeriod === '24h' && latestForecast && latestForecast.predicted_min_temp !== undefined) {
        let xStart = data.dateTime[0];
        let xEnd = data.dateTime[data.dateTime.length - 1];
        traces.push({
            x: [xStart, xEnd],
            y: [latestForecast.predicted_min_temp, latestForecast.predicted_min_temp],
            type: 'scatter',
            mode: 'lines',
            name: 'AI Predicted Min',
            line: { color: COLORS.fieldDrab, width: 3, dash: 'solid' },
            showlegend: true
        });
        traces.push({
            x: [xStart, xEnd],
            y: [latestForecast.predicted_max_temp, latestForecast.predicted_max_temp],
            type: 'scatter',
            mode: 'lines',
            name: 'AI Predicted Max',
            line: { color: COLORS.gold, width: 3, dash: 'solid' },
            showlegend: true
        });
        annotations.push({
            x: xEnd,
            y: latestForecast.predicted_min_temp,
            xref: 'x',
            yref: 'y',
            text: `${latestForecast.predicted_min_temp}°C`,
            showarrow: false,
            font: { color: COLORS.fieldDrab, size: 14, weight: 'bold' },
            align: 'left',
            xanchor: 'left',
            yanchor: 'middle',
            bgcolor: 'rgba(255,255,255,0.7)',
            bordercolor: COLORS.fieldDrab,
            borderpad: 2
        });
        annotations.push({
            x: xEnd,
            y: latestForecast.predicted_max_temp,
            xref: 'x',
            yref: 'y',
            text: `${latestForecast.predicted_max_temp}°C`,
            showarrow: false,
            font: { color: COLORS.gold, size: 14, weight: 'bold' },
            align: 'left',
            xanchor: 'left',
            yanchor: 'middle',
            bgcolor: 'rgba(255,255,255,0.7)',
            bordercolor: COLORS.gold,
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
            line: { color: COLORS.fieldDrab }
        },
        {
            x: data.dateTime,
            y: data.outHumidity,
            type: 'scatter',
            mode: 'lines',
            name: 'Outside Humidity',
            line: { color: COLORS.greenBlue }
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
        line: { color: COLORS.fieldDrab }
    }], {yaxis: { title: 'hPa' }});
    setOverlay('pressure-overlay', lastValid(data.barometer), 'hPa', 1);
}

function updateRainfallGraph(data) {
    plotGraph('rainfall-graph', [{
        x: data.dateTime,
        y: data.rain,
        type: 'bar',
        name: 'Rainfall',
        marker: { color: COLORS.tuftsBlue }
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
            line: { color: COLORS.greenBlue },
            yaxis: 'y1'
        },
        {
            x: data.dateTime,
            y: data.windDir,
            type: 'scatter',
            mode: 'markers',
            name: 'Wind Direction (°)',
            marker: { color: COLORS.gold, size: 6 },
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

function updateWindChillGraph(data) {
    plotGraph('wind-chill-graph', [{
        x: data.dateTime,
        y: data.windChill,
        type: 'scatter',
        mode: 'lines',
        name: 'Wind Chill',
        line: { color: COLORS.powderBlue }
    }], {yaxis: { title: '°C' }});
    setOverlay('wind-chill-overlay', lastValid(data.windChill), '°C', 1);
}

function updateLightningGraph(data) {
    // Only show distance bar when strike count is 1 or more
    const filteredDistance = data.lightning_distance.map((dist, i) => {
        const count = data.lightning_strike_count[i];
        return (count !== null && count !== undefined && !isNaN(count) && count >= 1) ? dist : null;
    });
    plotGraph('lightning-graph', [
        {
            x: data.dateTime,
            y: filteredDistance,
            type: 'bar',
            name: 'Distance (km)',
            marker: { color: COLORS.tuftsBlue },
            yaxis: 'y1',
        },
        {
            x: data.dateTime,
            y: data.lightning_strike_count,
            type: 'bar',
            name: 'Count',
            marker: { color: COLORS.gold },
            yaxis: 'y2',
        }
    ], {
        yaxis: { title: 'Distance (km)', rangemode: 'tozero', zeroline: true, zerolinewidth: 2, zerolinecolor: '#888' },
        yaxis2: {
            title: 'Count',
            overlaying: 'y',
            side: 'right',
            rangemode: 'tozero',
            zeroline: true,
            zerolinewidth: 2,
            zerolinecolor: '#888',
        },
        barmode: 'group',
        legend: {
            orientation: 'h',
            x: 0,
            y: 1.1,
            xanchor: 'left',
            yanchor: 'bottom'
        }
    });
    setOverlay('lightning-overlay', lastValid(data.lightning_strike_count), 'strikes', 0);
}

function updateSolarGraph(data) {
    plotGraph('solar-graph', [{
        x: data.dateTime,
        y: data.luminosity,
        type: 'scatter',
        mode: 'lines',
        name: 'Solar (kLux)',
        line: { color: COLORS.powderBlue }
    }], {yaxis: { title: 'kLux' }});
    setOverlay('solar-overlay', lastValid(data.luminosity), 'kLux', 2);
}

function updateHeatIndexGraph(data) {
    plotGraph('heat-index-graph', [{
        x: data.dateTime,
        y: data.heatIndex,
        type: 'scatter',
        mode: 'lines',
        name: 'Heat Index',
        line: { color: COLORS.gold }
    }], {yaxis: { title: '°C' }});
    setOverlay('heat-index-overlay', lastValid(data.heatIndex), '°C', 1);
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

function updatePeriodLabels() {
    let label;
    if (window.innerWidth <= 1024 || window.innerHeight <= 768) {
        label = 'Currently';
    } else {
        const periodMap = {
            '24h': 'Last 24 hours',
            '72h': 'Last 72 hours',
            '7d': 'Last 7 days',
            '28d': 'Last 28 days'
        };
        label = periodMap[currentPeriod] || '';
    }
    [
        'outside-temp', 'solar', 'heat-index', 'rainfall', 'lightning',
        'inside-temp', 'pressure', 'wind-chill', 'humidity', 'wind'
    ].forEach(id => {
        const el = document.getElementById(id + '-period');
        if (el) el.textContent = label;
    });
}

window.addEventListener('resize', updatePeriodLabels);

function updateCurrentTime() {
    const el = document.getElementById('current-time');
    if (!el) return;
    const now = new Date();
    const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = now.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    el.textContent = `As At ${timeStr} on ${dateStr}`;
}

function parseLocalTimeString(timeStr) {
    // Expects 'h:mm:ss AM/PM' format
    const [time, period] = timeStr.split(' ');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    let hour = hours;
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minutes, seconds);
}

function fetchAndDisplaySunriseSunset() {
    const lat = -27.407259185389066;
    const lon = 152.9198965081402;
    const tzid = 'Australia/Brisbane';
    const url = `https://api.sunrise-sunset.org/json?lat=${lat}&lng=${lon}&date=today&tzid=${tzid}`;
    fetch(url)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'OK' && data.results) {
                const sunrise = data.results.sunrise;
                const sunset = data.results.sunset;
                document.getElementById('sunrise-sunset-info').innerHTML =
                    `<span>Sunrise: <strong>${sunrise}</strong> &nbsp;|&nbsp; Sunset: <strong>${sunset}</strong></span>`;
                // Parse times to Date objects using the local timezone (Australia/Brisbane)
                sunriseTime = parseLocalTimeString(sunrise);
                sunsetTime = parseLocalTimeString(sunset);
                // Immediately update camera status after sunrise/sunset times are updated
                updateWeatherCamTimestamp();
                refreshWeatherCamImage();
            } else {
                document.getElementById('sunrise-sunset-info').textContent = 'Sunrise/Sunset info unavailable.';
                sunriseTime = null;
                sunsetTime = null;
            }
        })
        .catch(() => {
            document.getElementById('sunrise-sunset-info').textContent = 'Sunrise/Sunset info unavailable.';
            sunriseTime = null;
            sunsetTime = null;
        });
}

function scheduleSunriseSunsetUpdate() {
    // Calculate ms until next 00:01
    const now = new Date();
    const next = new Date(now);
    next.setHours(0, 1, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const msUntilNext = next - now;
    setTimeout(() => {
        fetchAndDisplaySunriseSunset();
        scheduleSunriseSunsetUpdate();
    }, msUntilNext);
}

function isCamActiveNow() {
    if (!sunriseTime || !sunsetTime) return true; // fallback: always active
    const now = new Date();
    const beforeSunrise = new Date(sunriseTime.getTime() - 15 * 60 * 1000);
    const afterSunset = new Date(sunsetTime.getTime() + 15 * 60 * 1000);
    return now >= beforeSunrise && now <= afterSunset;
}

function refreshWeatherCamImage() {
    const camImg = document.querySelector('img[alt="Weather Cam"]');
    const overlay = document.getElementById('weather-cam-offline-overlay');
    if (!isCamActiveNow()) {
        if (overlay) overlay.style.display = 'flex';
        if (camImg) camImg.style.opacity = 0.3;
        return;
    } else {
        if (overlay) overlay.style.display = 'none';
        if (camImg) camImg.style.opacity = 1;
    }
    if (camImg) {
        // Add a cache-busting query string
        camImg.src = 'static/images/latest.jpg?t=' + new Date().getTime();
    }
}

function updateWeatherCamTimestamp() {
    if (!isCamActiveNow()) {
        const el = document.getElementById('weather-cam-timestamp');
        if (el) el.textContent = '';
        return;
    }
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';

    fetch(`${basePath}/static/images/latest.jpg`, { method: 'HEAD' })
        .then(res => {
            const lastMod = res.headers.get('Last-Modified');
            if (lastMod) {
                const date = new Date(lastMod);
                const formatted = 'SE Aspect as at ' + date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
                const el = document.getElementById('weather-cam-timestamp');
                if (el) el.textContent = formatted;
            }
        });
}

// Function to fetch and update battery status
function fetchAndUpdateBattery() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    fetch(`${basePath}/api/battery`)
        .then(res => res.json())
        .then(data => {
            updateBatteryStatus(data);
        })
        .catch(error => {
            console.error('Error fetching battery status:', error);
        });
}

// Function to update battery status
function updateBatteryStatus(data) {
    updateBatteryCard('console', data.console);
    updateBatteryCard('outdoor', data.outdoor);
    updateBatteryCard('array', data.array);
    updateBatteryCard('lightning', data.lightning);
}

// Function to update battery card
function updateBatteryCard(type, info) {
    const iconDiv = document.getElementById(`${type}-battery-icon`);
    const statusDiv = document.getElementById(`${type}-battery-status`);
    if (!iconDiv || !statusDiv) {
        return;
    }
    let svg = '';
    if (info.status === 'ok') {
        svg = `<svg width="192" height="192" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="14" width="32" height="20" rx="4" fill="#28a745" stroke="#222" stroke-width="2"/><rect x="40" y="20" width="4" height="8" rx="2" fill="#222"/><rect x="12" y="18" width="24" height="12" rx="2" fill="#fff" fill-opacity="0.2"/></svg>`;
        statusDiv.className = 'battery-status-text battery-status-ok';
    } else {
        svg = `<svg width="192" height="192" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="14" width="32" height="20" rx="4" fill="#d32f2f" stroke="#222" stroke-width="2"/><rect x="40" y="20" width="4" height="8" rx="2" fill="#222"/><rect x="12" y="18" width="24" height="12" rx="2" fill="#fff" fill-opacity="0.2"/></svg>`;
        statusDiv.className = 'battery-status-text battery-status-low';
    }
    iconDiv.innerHTML = svg;
    statusDiv.textContent = info.label;
}

function fetchAndUpdateBarMetrics() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    fetch(`${basePath}/api/bar_metrics`)
        .then(res => res.json())
        .then(data => {
            updateBarAreaTempHumidity(data);
            updateOutsideCO2Card(data);
            updatePM25Card(data);
            updatePM10Card(data);
        });
}

function updateBarAreaTempHumidity(data) {
    const barAreaDiv = document.getElementById('bar-area-temp-humidity');
    if (barAreaDiv) {
        let temp = data.bar_area_temp || '--';
        let hum = data.bar_area_humidity || '--';
        barAreaDiv.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:1.2rem;font-weight:500;">Temperature</div>
                <div style="font-size:2.4rem;font-weight:700;line-height:1.1;">${temp}</div>
                <div style="font-size:1.2rem;font-weight:500;margin-top:1.2em;">Humidity</div>
                <div style="font-size:2.2rem;font-weight:700;line-height:1.1;">${hum}</div>
            </div>
        `;
    }
}

function updateOutsideCO2Card(data) {
    const co2Div = document.getElementById('outside-co2');
    if (!co2Div) return;
    let co2 = data.outside_co2;
    let scale = 'Unknown';
    let img = 'unknown.jpg';
    let bgColor = '#f8fafc';
    if (typeof co2 === 'number') {
        if (co2 >= 0 && co2 < 350) { scale = 'Good'; img = 'Good.png'; bgColor = '#d4f7d4'; }
        else if (co2 >= 350 && co2 < 1000) { scale = 'Moderate'; img = 'Moderate.png'; bgColor = '#fff9c4'; }
        else if (co2 >= 1000 && co2 < 2000) { scale = 'Poor'; img = 'Poor.png'; bgColor = '#ffe0b2'; }
        else if (co2 >= 2000 && co2 < 5000) { scale = 'Unhealthy'; img = 'Unhealthy.png'; bgColor = '#ffcdd2'; }
        else if (co2 >= 5000 && co2 < 40000) { scale = 'Severe'; img = 'Severe.png'; bgColor = '#b3e5fc'; }
        else if (co2 >= 40000) { scale = 'Hazardous'; img = 'Hazardous.png'; bgColor = '#e1bee7'; }
    }
    co2Div.style.background = bgColor;
    co2Div.innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:1.2rem;font-weight:500;">CO₂ Level</div>
            <div style="font-size:2.4rem;font-weight:700;line-height:1.1;">${co2 !== undefined && co2 !== null ? co2 + ' ppm' : '--'}</div>
            <div style="font-size:1.2rem;font-weight:500;margin-top:1.2em;">${scale}</div>
            <img src="static/images/${img}" alt="${scale}" style="max-width:80px;max-height:80px;margin-top:0.5em;" />
        </div>
    `;
}

function updatePM25Card(data) {
    const pm25Div = document.getElementById('outside-pm25');
    if (!pm25Div) return;
    let pm25 = data.pm25;
    let scale = 'Unknown';
    let img = 'unknown.jpg';
    let bgColor = '#f8fafc';
    if (typeof pm25 === 'number') {
        if (pm25 >= 0 && pm25 <= 12) { scale = 'Good'; img = 'Good.png'; bgColor = '#d4f7d4'; }
        else if (pm25 > 12 && pm25 <= 35.4) { scale = 'Moderate'; img = 'Moderate.png'; bgColor = '#fff9c4'; }
        else if (pm25 > 35.4 && pm25 <= 55.4) { scale = 'Poor'; img = 'Poor.png'; bgColor = '#ffe0b2'; }
        else if (pm25 > 55.4 && pm25 <= 150.4) { scale = 'Unhealthy'; img = 'Unhealthy.png'; bgColor = '#ffcdd2'; }
        else if (pm25 > 150.4 && pm25 <= 250.4) { scale = 'Severe'; img = 'Severe.png'; bgColor = '#b3e5fc'; }
        else if (pm25 > 250.4) { scale = 'Hazardous'; img = 'Hazardous.png'; bgColor = '#e1bee7'; }
    }
    let pm25Display = (typeof pm25 === 'number') ? pm25 + ' µg/m³' : '--';
    pm25Div.style.background = bgColor;
    pm25Div.innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:1.2rem;font-weight:500;">PM2.5</div>
            <div style="font-size:2.4rem;font-weight:700;line-height:1.1;">${pm25Display}</div>
            <div style="font-size:1.2rem;font-weight:500;margin-top:1.2em;">${scale}</div>
            <img src="static/images/${img}" alt="${scale}" style="max-width:80px;max-height:80px;margin-top:0.5em;" />
        </div>
    `;
}

function updatePM10Card(data) {
    const pm10Div = document.getElementById('outside-pm10');
    if (!pm10Div) return;
    let pm10 = data.pm10;
    let scale = 'Unknown';
    let img = 'unknown.jpg';
    let bgColor = '#f8fafc';
    if (typeof pm10 === 'number') {
        if (pm10 >= 0 && pm10 <= 12) { scale = 'Good'; img = 'Good.png'; bgColor = '#d4f7d4'; }
        else if (pm10 > 12 && pm10 <= 35.4) { scale = 'Moderate'; img = 'Moderate.png'; bgColor = '#fff9c4'; }
        else if (pm10 > 35.4 && pm10 <= 55.4) { scale = 'Poor'; img = 'Poor.png'; bgColor = '#ffe0b2'; }
        else if (pm10 > 55.4 && pm10 <= 150.4) { scale = 'Unhealthy'; img = 'Unhealthy.png'; bgColor = '#ffcdd2'; }
        else if (pm10 > 150.4 && pm10 <= 250.4) { scale = 'Severe'; img = 'Severe.png'; bgColor = '#b3e5fc'; }
        else if (pm10 > 250.4) { scale = 'Hazardous'; img = 'Hazardous.png'; bgColor = '#e1bee7'; }
    }
    let pm10Display = (typeof pm10 === 'number') ? pm10 + ' µg/m³' : '--';
    pm10Div.style.background = bgColor;
    pm10Div.innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:1.2rem;font-weight:500;">PM10</div>
            <div style="font-size:2.4rem;font-weight:700;line-height:1.1;">${pm10Display}</div>
            <div style="font-size:1.2rem;font-weight:500;margin-top:1.2em;">${scale}</div>
            <img src="static/images/${img}" alt="${scale}" style="max-width:80px;max-height:80px;margin-top:0.5em;" />
        </div>
    `;
}

function updateTimelapseDate() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';

    fetch(`${basePath}/static/videos/latest_tl.mp4`, { method: 'HEAD' })
        .then(res => {
            const lastMod = res.headers.get('Last-Modified');
            if (lastMod) {
                const date = new Date(lastMod);
                const formatted = date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
                const timelapseDate = document.getElementById('timelapse-date');
                if (timelapseDate) {
                    timelapseDate.textContent = formatted;
                }
            }
        });
} 