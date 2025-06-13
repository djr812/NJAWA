document.addEventListener('DOMContentLoaded', function() {
    // Initialize all charts
    initializeCharts();
    
    // Start data updates
    updateWeatherData();
    setInterval(updateWeatherData, 60000); // Update every minute
    
    // Initialize timelapse video elements if they exist
    const playButton = document.getElementById('play-timelapse');
    const timeLapseVideo = document.getElementById('timelapse-video');
    const videoContainer = document.getElementById('video-container');
    
    if (playButton && timeLapseVideo && videoContainer) {
        let videoLoaded = false;
        
        function loadTimeLapseVideo() {
            if (!videoLoaded) {
                timeLapseVideo.src = '/static/videos/weather_cam_timelapse.mp4';
                videoLoaded = true;
            }
        }

        playButton.addEventListener('click', function() {
            loadTimeLapseVideo();
            videoContainer.classList.remove('d-none');
            timeLapseVideo.play();
            playButton.classList.add('d-none');
        });

        timeLapseVideo.addEventListener('ended', function() {
            videoContainer.classList.add('d-none');
            playButton.classList.remove('d-none');
        });
    }

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
            updateActualWeatherConditions(data);
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

async function updatePredictedWeatherConditionsCard(forecast) {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';

    const cardBody = document.getElementById('predicted-weather-conditions-body');
    if (!cardBody) return;

    // Clear existing content
    cardBody.innerHTML = '';

    if (forecast && forecast.ai_forecast) {
        // Create main container with flex layout
        const mainContainer = document.createElement('div');
        mainContainer.style.display = 'flex';
        mainContainer.style.width = '100%';
        mainContainer.style.gap = '20px';
        cardBody.appendChild(mainContainer);

        // Left Column: Image and Condition
        const leftColumn = document.createElement('div');
        leftColumn.style.flex = '1';
        leftColumn.style.display = 'flex';
        leftColumn.style.flexDirection = 'column';
        leftColumn.style.alignItems = 'center';
        mainContainer.appendChild(leftColumn);

        // Create image element
        const img = document.createElement('img');
        img.src = `${basePath}/static/images/${forecast.ai_forecast}.png`;
        img.alt = forecast.ai_forecast;
        img.className = 'img-fluid weather-cam-img';
        img.style.maxHeight = '180px';
        img.style.marginBottom = '10px';
        leftColumn.appendChild(img);

        // Create text element for forecast
        const textDiv = document.createElement('div');
        textDiv.className = 'ai-forecast-text';
        textDiv.style.fontSize = '1.5rem';
        textDiv.style.fontWeight = 'bold';
        textDiv.style.textAlign = 'center';
        textDiv.style.marginBottom = '10px';

        // Add wind forecast text based on ai_wind_forecast value
        let windText = '';
        if (forecast.ai_wind_forecast) {
            switch (forecast.ai_wind_forecast) {
                case 'Calm':
                    windText = ' and calm';
                    break;
                case 'Light Breeze':
                    windText = ' with a light breeze';
                    break;
                case 'Stiff Breeze':
                    windText = ' with a stiff breeze';
                    break;
                case 'Windy':
                    windText = ' with windy conditions';
                    break;
                case 'High Winds':
                    windText = '. Caution: High Winds Possible!';
                    break;
            }
        }
        
        textDiv.textContent = forecast.ai_forecast + windText;
        leftColumn.appendChild(textDiv);

        // Right Column: Temperature Range and Probabilities
        const rightColumn = document.createElement('div');
        rightColumn.style.flex = '1';
        rightColumn.style.display = 'flex';
        rightColumn.style.flexDirection = 'column';
        rightColumn.style.justifyContent = 'center';
        mainContainer.appendChild(rightColumn);

        // Add predicted temperature range
        if (forecast.predicted_min_temp !== undefined && forecast.predicted_max_temp !== undefined) {
            const tempRangeDiv = document.createElement('div');
            tempRangeDiv.style.fontSize = '1.2rem';
            tempRangeDiv.style.color = COLORS.fieldDrab;
            tempRangeDiv.style.marginBottom = '15px';
            tempRangeDiv.textContent = `Predicted Range: ${forecast.predicted_min_temp.toFixed(1)}°C - ${forecast.predicted_max_temp.toFixed(1)}°C`;
            rightColumn.appendChild(tempRangeDiv);
        }

        // Create probability text elements
        if (forecast.chance_of_rain !== undefined) {
            const rainDiv = document.createElement('div');
            rainDiv.style.fontSize = '1.1rem';
            rainDiv.style.color = '#666';
            rainDiv.style.marginBottom = '10px';
            rainDiv.textContent = `Chance of Rain: ${forecast.chance_of_rain}%`;
            rightColumn.appendChild(rainDiv);
        }

        if (forecast.chance_of_lightning !== undefined) {
            const lightningDiv = document.createElement('div');
            lightningDiv.style.fontSize = '1.1rem';
            lightningDiv.style.color = '#666';
            lightningDiv.style.marginBottom = '10px';
            lightningDiv.textContent = `Chance of Lightning: ${forecast.chance_of_lightning}%`;
            rightColumn.appendChild(lightningDiv);
        }

        // Fetch and display training days
        try {
            const response = await fetch(`${basePath}/api/training_days`);
            const data = await response.json();
            
            // Create container for bottom text
            const bottomTextContainer = document.createElement('div');
            bottomTextContainer.style.marginTop = '20px';
            bottomTextContainer.style.paddingTop = '10px';
            bottomTextContainer.style.borderTop = '1px solid #ddd';
            bottomTextContainer.style.width = '100%';
            cardBody.appendChild(bottomTextContainer);

            // Training days text
            const trainingDaysDiv = document.createElement('div');
            trainingDaysDiv.className = 'training-days-text';
            trainingDaysDiv.style.fontSize = '0.9rem';
            trainingDaysDiv.style.color = '#666';
            trainingDaysDiv.style.textAlign = 'center';
            trainingDaysDiv.style.marginBottom = '5px';
            trainingDaysDiv.textContent = `AI Weather Model has been trained on ${data.days} days of data`;
            bottomTextContainer.appendChild(trainingDaysDiv);

            // Warning text
            const warningDiv = document.createElement('div');
            warningDiv.className = 'warning-text';
            warningDiv.style.fontSize = '0.9rem';
            warningDiv.style.color = '#666';
            warningDiv.style.textAlign = 'center';
            warningDiv.textContent = 'Warning: Do NOT plan your activities based on these predictions.';
            bottomTextContainer.appendChild(warningDiv);

        } catch (error) {
            console.error('Error fetching training days:', error);
        }
    } else {
        cardBody.innerHTML = '<p class="text-center">No forecast available</p>';
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
    plotGraph('solar-graph', [
        {
            x: data.dateTime,
            y: data.luminosity,
            type: 'scatter',
            mode: 'lines',
            name: 'Solar (kLux)',
            line: { color: COLORS.powderBlue },
            yaxis: 'y1'
        },
        {
            x: data.dateTime,
            y: data.uv,
            type: 'scatter',
            mode: 'lines',
            name: 'UV Index',
            line: { color: COLORS.gold },
            yaxis: 'y2'
        }
    ], {
        yaxis: { 
            title: 'kLux',
            side: 'left'
        },
        yaxis2: {
            title: 'UV Index',
            overlaying: 'y',
            side: 'right',
            rangemode: 'tozero'
        },
        legend: {
            orientation: 'h',
            x: 0,
            y: 1.1,
            xanchor: 'left',
            yanchor: 'bottom'
        }
    });
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
    const tempElement = document.getElementById('bar-area-temp');
    const humidityElement = document.getElementById('bar-area-humidity');
    
    console.log('Raw data:', data);
    console.log('Raw temp:', data?.bar_area_temp);
    console.log('Raw humidity:', data?.bar_area_humidity);
    
    if (data && data.bar_area_temp && data.bar_area_humidity) {
        // Extract numeric values from strings like "25.5°C" and "60%"
        const temp = parseFloat(data.bar_area_temp.replace('°C', ''));
        const humidity = parseFloat(data.bar_area_humidity.replace('%', ''));
        
        console.log('Parsed temp:', temp);
        console.log('Parsed humidity:', humidity);
        
        if (!isNaN(temp) && !isNaN(humidity)) {
            if (tempElement) {
                tempElement.textContent = `${temp.toFixed(1)}°C`;
            }
            if (humidityElement) {
                humidityElement.textContent = `${humidity.toFixed(1)}%`;
            }
            updateBarAreaComfortLevel(temp, humidity);
        } else {
            if (tempElement) tempElement.textContent = '--°C';
            if (humidityElement) humidityElement.textContent = '--%';
            updateBarAreaComfortLevel(null, null);
        }
    } else {
        if (tempElement) tempElement.textContent = '--°C';
        if (humidityElement) humidityElement.textContent = '--%';
        updateBarAreaComfortLevel(null, null);
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

function updateBarAreaComfortLevel(temp, humidity) {
    const comfortImg = document.getElementById('bar-area-comfort-img');
    const comfortText = document.getElementById('bar-area-comfort-text');
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    
    console.log('Comfort Level - Temp:', temp);
    console.log('Comfort Level - Humidity:', humidity);
    
    if (temp === null || humidity === null) {
        comfortImg.src = '';
        comfortText.textContent = '';
        return;
    }

    let imgName, text, bgColor;
    
    if (temp < 21) {
        imgName = 'Cold.png';
        text = 'Chilly';
        bgColor = '#e6f3ff'; // light blue
    } else if (temp >= 21 && temp <= 27) {
        if (humidity < 50) {
            imgName = 'Perfect.png';
            text = 'Perfect';
            bgColor = '#d4f7d4'; // light green
        } else {
            imgName = 'Good.png';
            text = 'Good';
            bgColor = '#90EE90'; // light green
        }
    } else if (temp > 27 && temp <= 30) {
        imgName = 'Moderate.png';
        text = 'Reasonable';
        bgColor = '#fff9c4'; // light yellow
    } else if (temp > 30 && temp <= 33) {
        imgName = 'Hot.png';
        text = 'Toasty';
        bgColor = '#ffcccc'; // light red
    } else {
        imgName = 'TooHot.png';
        text = 'Way too hot!';
        bgColor = '#ff0000'; // red
    }

    console.log('Selected bgColor:', bgColor);
    
    comfortImg.src = `${basePath}/static/images/${imgName}`;
    comfortText.textContent = text;
    
    // Update the card's background color with higher specificity
    const card = document.getElementById('bar-area-comfort-level');
    console.log('Card element:', card);
    if (card) {
        // Set background color on both the card and its header
        card.style.setProperty('background-color', bgColor, 'important');
        const header = card.querySelector('.card-header');
        if (header) {
            header.style.setProperty('background-color', bgColor, 'important');
        }
        const body = card.querySelector('.card-body');
        if (body) {
            body.style.setProperty('background-color', bgColor, 'important');
        }
        console.log('Set background color to:', card.style.backgroundColor);
    }
}

function updateOutsideCO2(data) {
    const co2Div = document.getElementById('outside-co2');
    if (co2Div) {
        let co2 = typeof data.outside_co2 === 'number' ? data.outside_co2.toFixed(1) : '--';
        co2Div.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:2.4rem;font-weight:700;line-height:1.1;">${co2}</div>
                <div style="font-size:1.2rem;font-weight:500;">ppm</div>
            </div>
        `;
    }
}

function updateOutsidePM25(data) {
    const pm25Div = document.getElementById('outside-pm25');
    if (pm25Div) {
        let pm25 = typeof data.outside_pm25 === 'number' ? data.outside_pm25.toFixed(1) : '--';
        pm25Div.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:2.4rem;font-weight:700;line-height:1.1;">${pm25}</div>
                <div style="font-size:1.2rem;font-weight:500;">µg/m³</div>
            </div>
        `;
    }
}

function updateOutsidePM10(data) {
    const pm10Div = document.getElementById('outside-pm10');
    if (pm10Div) {
        let pm10 = typeof data.outside_pm10 === 'number' ? data.outside_pm10.toFixed(1) : '--';
        pm10Div.innerHTML = `
            <div style="text-align:center;">
                <div style="font-size:2.4rem;font-weight:700;line-height:1.1;">${pm10}</div>
                <div style="font-size:1.2rem;font-weight:500;">µg/m³</div>
            </div>
        `;
    }
}

async function determineWeatherCondition(data) {
    // Get the values directly from the data object
    const latest = {
        lightning_strike_count: data.lightning_strike_count,
        lightning_distance: data.lightning_distance * 1.60934, // Convert miles to km
        rain: data.rain,
        windSpeed: data.windSpeed,
        outHumidity: data.outHumidity,
        cloudbase: data.cloudbase * 0.3048, // Convert feet to meters
        luminosity: data.luminosity
    };

    // Check if it's night time using local time
    const now = new Date();
    const localHour = now.getHours();
    const isNight = localHour < 6 || localHour >= 18; // Night is between 6 PM and 6 AM local time
    console.log('Night detection:', {
        isNight,
        localTime: now.toLocaleString(),
        localHour,
        isCamActive: isCamActiveNow()
    });

    if (isNight) {
        try {
            const isProd = window.location.hostname !== 'localhost';
            const basePath = isProd ? '/njawa' : '';
            console.log('Fetching weather condition from API...');
            const response = await fetch(`${basePath}/api/weather_condition`);
            const weatherData = await response.json();
            console.log('WeatherAPI Response:', weatherData);
            
            if (weatherData && weatherData.text && weatherData.icon) {
                console.log('Using WeatherAPI condition:', {
                    text: weatherData.text,
                    icon: weatherData.icon
                });
                return {
                    text: weatherData.text,
                    icon: weatherData.icon
                };
            } else {
                console.warn('WeatherAPI response missing required data:', weatherData);
            }
        } catch (error) {
            console.error('Error fetching weather condition:', error);
        }
    } else {
        console.log('Using day time condition logic with sensor data:', latest);
    }

    // Day time conditions (existing logic)
    // Clear skies (priority rule): very bright light, no rain or lightning
    if (latest.luminosity >= 30000 && latest.rain === 0 && latest.lightning_strike_count === 0) {
        console.log('Day condition: Clear');
        return {
            text: "Clear",
            icon: null
        };
    }
    // Electrical storm
    else if (latest.lightning_strike_count >= 1 && latest.lightning_distance < 15 && latest.rain > 0) {
        console.log('Day condition: Electrical Storm');
        return {
            text: "Electrical Storm",
            icon: null
        };
    }
    // Storm or heavy rain
    else if (latest.rain > 2 && latest.windSpeed > 25) {
        console.log('Day condition: Storm');
        return {
            text: "Storm",
            icon: null
        };
    }
    else if (latest.rain > 2) {
        console.log('Day condition: Heavy Rain');
        return {
            text: "Heavy Rain",
            icon: null
        };
    }
    else if (latest.rain > 0) {
        console.log('Day condition: Rain');
        return {
            text: "Rain",
            icon: null
        };
    }
    // Fog
    else if (latest.outHumidity > 95 && latest.cloudbase < 100) {
        console.log('Day condition: Fog');
        return {
            text: "Fog",
            icon: null
        };
    }
    // Overcast — only if light is very low and cloudbase is low
    else if (latest.luminosity < 8 && latest.cloudbase < 1000) {
        console.log('Day condition: Overcast');
        return {
            text: "Overcast",
            icon: null
        };
    }
    // Partly Cloudy — moderate light or moderate clouds
    else if (latest.luminosity >= 8 && latest.luminosity < 30 && latest.cloudbase < 3000) {
        console.log('Day condition: Partly Cloudy');
        return {
            text: "Partly Cloudy",
            icon: null
        };
    }
    // Windy
    else if (latest.windSpeed > 20) {
        console.log('Day condition: Windy');
        return {
            text: "Windy",
            icon: null
        };
    }
    // Default
    else {
        console.log('Day condition: Default (Clear)');
        return {
            text: "Clear",
            icon: null
        };
    }
}

async function updateActualWeatherConditions(data) {
    // Helper function to safely get value (handles both arrays and single values)
    const getValue = (value, defaultValue = 0) => {
        if (value === undefined || value === null) {
            console.warn('Value is undefined or null');
            return defaultValue;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) {
                console.warn('Array is empty');
                return defaultValue;
            }
            const lastValue = value[value.length - 1];
            return lastValue === null ? defaultValue : lastValue;
        }
        return value;
    };

    // Get the values with validation
    const latest = {
        lightning_strike_count: Math.round(getValue(data.lightning_strike_count)),
        lightning_distance: getValue(data.lightning_distance) * 1.60934, // Convert miles to km
        rain: getValue(data.rain),
        windSpeed: getValue(data.windSpeed),
        windDir: getValue(data.windDir),
        outHumidity: getValue(data.outHumidity),
        cloudbase: getValue(data.cloudbase) * 0.3048, // Convert feet to meters
        luminosity: getValue(data.luminosity),
        outTemp: getValue(data.outTemp),
        barometer: getValue(data.barometer),
        UV: Math.round(getValue(data.uv)) // Round UV to whole number
    };

    console.log('Raw data for debugging:', {
        windDir: data.windDir,
        uv: data.uv,
        lightning_strike_count: data.lightning_strike_count
    });
    console.log('Processed latest values:', latest);

    const condition = await determineWeatherCondition(latest);
    console.log('Final condition object:', condition);
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    
    const cardBody = document.getElementById('actual-weather-conditions-body');
    if (!cardBody) {
        console.error('Could not find Actual Weather Conditions card body');
        return;
    }
    
    const conditionDisplay = cardBody.querySelector('.weather-condition');
    if (!conditionDisplay) {
        console.error('Could not find weather condition display');
        return;
    }

    // Helper function to convert degrees to compass bearing
    const degreesToCompass = (degrees) => {
        if (degrees === undefined || degrees === null || isNaN(degrees)) {
            console.warn('Invalid wind direction:', degrees);
            return '--';
        }
        const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 
                          'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const index = Math.round(degrees / 22.5) % 16;
        return directions[index];
    };
    
    // Map condition to image filename for day time conditions
    const conditionImageMap = {
        'Clear': 'Clear.png',
        'Electrical Storm': 'Electrical_strom.png',
        'Storm': 'Storm.png',
        'Heavy Rain': 'Heavy_rain.png',
        'Rain': 'Rain.png',
        'Fog': 'Fog.png',
        'Overcast': 'Overcast.png',
        'Partly Cloudy': 'Partly_cloudy.png',
        'Windy': 'Windy.png'
    };
    
    // Determine which image to use
    const imageSrc = condition.icon ? condition.icon : `${basePath}/static/images/${conditionImageMap[condition.text] || 'Clear.png'}`;
    console.log('Image source:', {
        usingWeatherAPI: !!condition.icon,
        imageSrc,
        conditionText: condition.text
    });
    
    // Helper function to safely format numbers
    const formatNumber = (value, decimals = 2) => {
        if (value === undefined || value === null || isNaN(value)) {
            console.warn('Invalid number value:', value);
            return '--';
        }
        return Number(value).toFixed(decimals);
    };
    
    // Update the condition text with appropriate styling
    conditionDisplay.innerHTML = `
        <div style="width: 100%; max-width: 100%; margin: 0; padding: 0; box-sizing: border-box;">
            <div style="display: flex; width: 100%; box-sizing: border-box;">
                <!-- Column 1: Image and Condition -->
                <div style="width: 400px; min-width: 400px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    <img src="${imageSrc}" alt="${condition.text}" style="height: 120px; width: auto; margin-bottom: 1rem;">
                    <div class="h2" style="font-weight: 700;">${condition.text}</div>
                </div>
                
                <!-- Column 2: Temperature, Pressure, Rain, UV -->
                <div style="width: 300px; min-width: 300px; box-sizing: border-box;">
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">TEMPERATURE</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(latest.outTemp)}°C</div>
                    </div>
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">REL. AIR PRESSURE</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(latest.barometer)} hPa</div>
                    </div>
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">RAIN</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(latest.rain)} mm</div>
                    </div>
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">UV RATING</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${latest.UV === 0 ? '0' : (latest.UV || '--')}</div>
                    </div>
                </div>
                
                <!-- Column 3: Humidity, Wind, Lightning -->
                <div style="width: 300px; min-width: 300px; box-sizing: border-box;">
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">HUMIDITY</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(latest.outHumidity)}%</div>
                    </div>
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">WIND SPEED</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(latest.windSpeed)} km/h</div>
                    </div>
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">WIND DIRECTION</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${degreesToCompass(latest.windDir)}</div>
                    </div>
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">LIGHTNING STRIKES</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${latest.lightning_strike_count === 0 ? '0' : (latest.lightning_strike_count || '--')}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    console.log('Updated card with condition:', condition);
}

// Initialize all charts
function initializeCharts() {
    // Outside Temperature Graph
    const outsideTempCtx = document.getElementById('outside-temp-chart');
    if (outsideTempCtx) {
        new Chart(outsideTempCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Outside Temperature',
                    data: [],
                    borderColor: COLORS.fieldDrab,
                    backgroundColor: 'rgba(76, 61, 43, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        position: 'bottom',
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#666'
                        },
                        border: {
                            display: true
                        }
                    },
                    y: {
                        position: 'left',
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            color: '#666'
                        },
                        border: {
                            display: true
                        }
                    }
                }
            }
        });
    }

    // Rainfall Graph
    const rainfallCtx = document.getElementById('rainfall-chart');
    if (rainfallCtx) {
        new Chart(rainfallCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Rainfall',
                    data: [],
                    borderColor: COLORS.rainBlue,
                    backgroundColor: 'rgba(0, 123, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            color: '#666'
                        }
                    },
                    y: {
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            color: '#666'
                        }
                    }
                }
            }
        });
    }

    // Lightning Graph
    const lightningCtx = document.getElementById('lightning-chart');
    if (lightningCtx) {
        new Chart(lightningCtx.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Lightning',
                    data: [],
                    borderColor: COLORS.lightningYellow,
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            color: '#666'
                        }
                    },
                    y: {
                        grid: {
                            display: true,
                            color: 'rgba(0, 0, 0, 0.1)'
                        },
                        ticks: {
                            color: '#666'
                        }
                    }
                }
            }
        });
    }
}

// Function to get UV risk level and time to sunburn
function getUVInfo(uvIndex) {
    let riskLevel, timeToBurn;
    
    if (uvIndex <= 2) {
        riskLevel = 'Low';
        timeToBurn = '> 1 hour';
    } else if (uvIndex <= 5) {
        riskLevel = 'Moderate';
        timeToBurn = '30-45 minutes';
    } else if (uvIndex <= 7) {
        riskLevel = 'High';
        timeToBurn = '15-25 minutes';
    } else if (uvIndex <= 10) {
        riskLevel = 'Very High';
        timeToBurn = '10-15 minutes';
    } else {
        riskLevel = 'Extreme';
        timeToBurn = '< 10 minutes';
    }
    
    return { riskLevel, timeToBurn };
}

// Function to update UV Level card
function updateUVLevelCard(uvIndex) {
    console.log('Updating UV Level card with index:', uvIndex);
    
    const uvLevelElement = document.getElementById('uv-level');
    const uvRiskElement = document.getElementById('uv-risk');
    const uvImageElement = document.getElementById('uv-image');
    const card = uvLevelElement?.closest('.card');
    
    if (!uvLevelElement || !uvRiskElement || !uvImageElement || !card) {
        console.error('UV Level card elements not found');
        return;
    }
    
    // Round UV index to whole number
    const roundedUV = Math.round(uvIndex);
    
    // Update UV level
    uvLevelElement.textContent = roundedUV;
    
    // Determine risk level, color, and time to sunburn
    let riskLevel, bgColor, img;
    if (roundedUV <= 2) {
        riskLevel = 'Low';
        bgColor = '#d4f7d4'; // Light green (same as Good)
        img = 'Good.png';
    } else if (roundedUV <= 5) {
        riskLevel = 'Moderate';
        bgColor = '#fff9c4'; // Light yellow (same as Moderate)
        img = 'Moderate.png';
    } else if (roundedUV <= 7) {
        riskLevel = 'High';
        bgColor = '#ffe0b2'; // Light orange (same as Poor)
        img = 'Poor.png';
    } else if (roundedUV <= 10) {
        riskLevel = 'Very High';
        bgColor = '#ffcdd2'; // Light red (same as Unhealthy)
        img = 'Unhealthy.png';
    } else {
        riskLevel = 'Extreme';
        bgColor = '#e1bee7'; // Light purple (same as Hazardous)
        img = 'Hazardous.png';
    }
    
    // Update risk level with time to sunburn
    let timeToBurn;
    if (roundedUV <= 2) timeToBurn = '60+ minutes to sunburn';
    else if (roundedUV <= 5) timeToBurn = '30 to 45 minutes to sunburn';
    else if (roundedUV <= 7) timeToBurn = '15 to 25 minutes to sunburn';
    else if (roundedUV <= 10) timeToBurn = '10 to 15 minutes to sunburn';
    else timeToBurn = 'less than 10 minutes to sunburn';
    
    uvRiskElement.textContent = `${riskLevel} - ${timeToBurn}`;
    
    // Update card background and image
    const cardBody = card.querySelector('.card-body');
    if (cardBody) {
        cardBody.style.backgroundColor = bgColor;
    }
    uvImageElement.src = `static/images/${img}`;
    
    console.log('UV Level card updated successfully');
}

// Update the updateWeatherData function to include UV level
async function updateWeatherData() {
    try {
        const isProd = window.location.hostname !== 'localhost';
        const basePath = isProd ? '/njawa' : '';
        
        // Fetch weather data
        const weatherResponse = await fetch(`${basePath}/api/data?period=24h`);
        if (!weatherResponse.ok) {
            throw new Error(`HTTP error! status: ${weatherResponse.status}`);
        }
        const weatherData = await weatherResponse.json();
        
        // Validate data arrays
        if (!weatherData.dateTime || !Array.isArray(weatherData.dateTime) || weatherData.dateTime.length === 0) {
            console.error('Invalid or empty dateTime array');
            return;
        }

        // Log first and last timestamps to verify order
        console.log('Data time range:', {
            first: weatherData.dateTime[0],
            last: weatherData.dateTime[weatherData.dateTime.length - 1]
        });
        
        // Get latest values for immediate updates
        const latestValues = {
            dateTime: weatherData.dateTime[weatherData.dateTime.length - 1],
            barometer: weatherData.barometer[weatherData.barometer.length - 1],
            cloudbase: weatherData.cloudbase[weatherData.cloudbase.length - 1],
            heatIndex: weatherData.heatIndex[weatherData.heatIndex.length - 1],
            inHumidity: weatherData.inHumidity[weatherData.inHumidity.length - 1],
            inTemp: weatherData.inTemp[weatherData.inTemp.length - 1],
            lightning_distance: weatherData.lightning_distance[weatherData.lightning_distance.length - 1],
            lightning_strike_count: weatherData.lightning_strike_count[weatherData.lightning_strike_count.length - 1],
            luminosity: weatherData.luminosity[weatherData.luminosity.length - 1],
            outHumidity: weatherData.outHumidity[weatherData.outHumidity.length - 1],
            outTemp: weatherData.outTemp[weatherData.outTemp.length - 1],
            rain: weatherData.rain[weatherData.rain.length - 1],
            uv: weatherData.uv[weatherData.uv.length - 1],
            windChill: weatherData.windChill[weatherData.windChill.length - 1],
            windDir: weatherData.windDir[weatherData.windDir.length - 1],
            windSpeed: weatherData.windSpeed[weatherData.windSpeed.length - 1]
        };
        
        console.log('Latest values:', latestValues);
        
        // Update all the weather data displays using existing functions
        updateActualWeatherConditions(weatherData); // Pass the full data object
        updateOutsideTempGraph(weatherData);
        updateRainfallGraph(weatherData);
        updateLightningGraph(weatherData);
        
        // Update UV Level card if UV data exists
        if (latestValues.uv !== undefined) {
            console.log('Updating UV Level card with:', latestValues.uv);
            updateUVLevelCard(latestValues.uv);
        } else {
            console.log('No UV data found in latest values');
        }
        
        // Fetch bar metrics data
        const barMetricsResponse = await fetch(`${basePath}/api/bar_metrics`);
        if (!barMetricsResponse.ok) {
            throw new Error(`HTTP error! status: ${barMetricsResponse.status}`);
        }
        const barMetricsData = await barMetricsResponse.json();
        
        // Update bar metrics
        updateBarAreaTempHumidity(barMetricsData);
        updateOutsideCO2Card(barMetricsData);
        updatePM25Card(barMetricsData);
        updatePM10Card(barMetricsData);
        
    } catch (error) {
        console.error('Error fetching weather data:', error);
    }
} 