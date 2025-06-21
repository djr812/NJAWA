document.addEventListener('DOMContentLoaded', function() {
    // Initialize all charts
    initializeCharts();
    
    // Start data updates
    setInterval(updateWeatherData, 300000); // Update every 5 minutes
    
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

    // Add QFD alerts functionality
    fetchAndUpdateQFDAlerts();
    setInterval(fetchAndUpdateQFDAlerts, 30 * 60 * 1000); // Update every 30 minutes
    
    // Initialize BOM Warnings
    fetchAndUpdateBOMWarnings();
    setInterval(fetchAndUpdateBOMWarnings, 6 * 60 * 60 * 1000); // Update every 6 hours
    
    // Initialize Top Stats
    fetchAndUpdateTopStats();
    setInterval(fetchAndUpdateTopStats, 60 * 60 * 1000); // Update every hour
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
            
            // Update UV Level card if UV data exists
            if (data.uv && data.uv.length > 0) {
                const latestUV = data.uv[data.uv.length - 1];
                if (latestUV !== undefined) {
                    console.log('Updating UV Level card with:', latestUV);
                    updateUVLevelCard(latestUV);
                }
            }
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

        // Add predicted minimum temperature with confidence and range
        if (forecast.predicted_min_temp !== undefined) {
            const minTempDiv = document.createElement('div');
            minTempDiv.style.fontSize = '1.2rem';
            minTempDiv.style.color = '#666';
            minTempDiv.style.marginBottom = '15px';
            minTempDiv.innerHTML = `
                Predicted Min Temp: ${forecast.predicted_min_temp.toFixed(1)}°C (Confidence ${forecast.predicted_min_temp_confidence.toFixed(1)}%)<br>
                Range: ${forecast.predicted_min_temp_range}
            `;
            rightColumn.appendChild(minTempDiv);
        }

        // Add predicted maximum temperature with confidence and range
        if (forecast.predicted_max_temp !== undefined) {
            const maxTempDiv = document.createElement('div');
            maxTempDiv.style.fontSize = '1.2rem';
            maxTempDiv.style.color = '#666';
            maxTempDiv.style.marginBottom = '15px';
            maxTempDiv.innerHTML = `
                Predicted Max Temp: ${forecast.predicted_max_temp.toFixed(1)}°C (Confidence ${forecast.predicted_max_temp_confidence.toFixed(1)}%)<br>
                Range: ${forecast.predicted_max_temp_range}
            `;
            rightColumn.appendChild(maxTempDiv);
        }

        // Add chance of rain with confidence
        if (forecast.chance_of_rain !== undefined) {
            const rainDiv = document.createElement('div');
            rainDiv.style.fontSize = '1.2rem';
            rainDiv.style.color = '#666';
            rainDiv.style.marginBottom = '15px';
            rainDiv.innerHTML = `Chance of Rain: ${forecast.chance_of_rain.toFixed(1)}% (Confidence ${forecast.chance_of_rain_confidence.toFixed(1)}%)`;
            rightColumn.appendChild(rainDiv);
        }

        // Add chance of lightning with confidence
        if (forecast.chance_of_lightning !== undefined) {
            const lightningDiv = document.createElement('div');
            lightningDiv.style.fontSize = '1.2rem';
            lightningDiv.style.color = '#666';
            lightningDiv.style.marginBottom = '15px';
            lightningDiv.innerHTML = `Chance of Lightning: ${forecast.chance_of_lightning.toFixed(1)}% (Confidence ${forecast.chance_of_lightning_confidence.toFixed(1)}%)`;
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
    // Convert to Brisbane time
    const brisbaneTime = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }));
    const timeStr = brisbaneTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = brisbaneTime.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
    el.textContent = `Local Time in Brisbane, Australia is ${timeStr} on ${dateStr}`;
}

function parseLocalTimeString(timeStr) {
    // Expects 'h:mm:ss AM/PM' format
    const [time, period] = timeStr.split(' ');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    let hour = hours;
    if (period === 'PM' && hour < 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    
    // Create date in Brisbane timezone
    const now = new Date();
    const brisbaneDate = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Brisbane' }));
    return new Date(brisbaneDate.getFullYear(), brisbaneDate.getMonth(), brisbaneDate.getDate(), hour, minutes, seconds);
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
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    
    try {
        // Always use the API call method
        const response = await fetch(`${basePath}/api/weather_condition`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const weatherData = await response.json();
        console.log('Weather API response:', weatherData);
        
        return {
            text: weatherData.text,
            icon: weatherData.icon
        };
    } catch (error) {
        console.error('Error fetching weather condition:', error);
        return {
            text: 'Clear',
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

    // Fetch 24-hour rainfall total
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    let rainfall24h = 0;
    
    try {
        const rainfallResponse = await fetch(`${basePath}/api/rainfall_24h`);
        const rainfallData = await rainfallResponse.json();
        rainfall24h = rainfallData.rainfall_24h || 0;
    } catch (error) {
        console.error('Error fetching 24-hour rainfall:', error);
        rainfall24h = 0;
    }

    console.log('Raw data for debugging:', {
        windDir: data.windDir,
        uv: data.uv,
        lightning_strike_count: data.lightning_strike_count
    });
    console.log('Processed latest values:', latest);
    console.log('24-hour rainfall total:', rainfall24h);

    const condition = await determineWeatherCondition(latest);
    console.log('Final condition object:', condition);
    
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
            <div style="display: flex; flex-wrap: wrap; width: 100%; box-sizing: border-box; gap: 1rem;">
                <!-- Column 1: Image and Condition -->
                <div style="flex: 1; min-width: 300px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; align-items: center;">
                    <img src="${imageSrc}" alt="${condition.text}" style="height: 180px; width: auto; margin-bottom: 1rem; object-fit: contain;">
                    <div class="h2" style="font-weight: 700;">${condition.text}</div>
                </div>
                
                <!-- Column 2: Temperature, Pressure, Rain, UV -->
                <div style="flex: 1; min-width: 250px; box-sizing: border-box;">
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">TEMPERATURE</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(latest.outTemp)}°C</div>
                    </div>
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">REL. AIR PRESSURE</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(latest.barometer)} hPa</div>
                    </div>
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">RAIN (24H)</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(rainfall24h)} mm</div>
                    </div>
                    <div class="mb-4">
                        <div class="h6 mb-1" style="color: #666;">UV RATING</div>
                        <div style="font-size: 1.5rem; font-weight: 700;">${latest.UV === 0 ? '0' : (latest.UV || '--')}</div>
                    </div>
                </div>
                
                <!-- Column 3: Humidity, Wind, Lightning -->
                <div style="flex: 1; min-width: 250px; box-sizing: border-box;">
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
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';

    try {
        const response = await fetch(`${basePath}/api/weather_condition`);
        const data = await response.json();
        
        if (data.condition) {
            await updateActualWeatherConditions(latestData);
        }
    } catch (error) {
        console.error('Error updating weather data:', error);
    }
}

// QFD Alerts functionality
async function fetchAndUpdateQFDAlerts() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';

    try {
        const response = await fetch(`${basePath}/api/qfd_alerts`);
        const data = await response.json();
        updateQFDAlertsCard(data);
    } catch (error) {
        console.error('Error fetching QFD alerts:', error);
        updateQFDAlertsCard({ alerts: [], count: 0, error: 'Failed to fetch alerts' });
    }
}

function updateQFDAlertsCard(data) {
    const cardBody = document.getElementById('qfd-alerts-body');
    if (!cardBody) return;

    // Clear existing content
    cardBody.innerHTML = '';

    if (data.error) {
        // Display error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'text-center text-muted';
        errorDiv.innerHTML = `
            <div class="mb-2">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div>Unable to load alerts</div>
            <small>${data.error}</small>
        `;
        cardBody.appendChild(errorDiv);
        return;
    }

    if (!data.alerts || data.alerts.length === 0) {
        // Display no alerts message
        const noAlertsDiv = document.createElement('div');
        noAlertsDiv.className = 'text-center text-success';
        noAlertsDiv.innerHTML = `
            <div class="mb-2">
                <i class="fas fa-check-circle"></i>
            </div>
            <div>No active alerts</div>
            <small>All clear in the Ferny Grove area</small>
        `;
        cardBody.appendChild(noAlertsDiv);
        return;
    }

    // Create alerts container
    const alertsContainer = document.createElement('div');
    alertsContainer.className = 'qfd-alerts-container';
    alertsContainer.style.maxHeight = '300px';
    alertsContainer.style.overflowY = 'auto';
    cardBody.appendChild(alertsContainer);

    // Add each alert
    data.alerts.forEach((alert, index) => {
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert-item mb-3';
        alertDiv.style.border = '1px solid #dee2e6';
        alertDiv.style.borderRadius = '8px';
        alertDiv.style.padding = '12px';
        alertDiv.style.backgroundColor = getAlertBackgroundColor(alert.warning_level);

        const warningLevelBadge = document.createElement('span');
        warningLevelBadge.className = 'badge me-2';
        warningLevelBadge.style.backgroundColor = getAlertBadgeColor(alert.warning_level);
        warningLevelBadge.style.color = 'white';
        warningLevelBadge.textContent = alert.warning_level;

        const titleDiv = document.createElement('div');
        titleDiv.className = 'fw-bold mb-1';
        titleDiv.style.fontSize = '0.9rem';
        titleDiv.textContent = alert.warning_title;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'mb-2';
        headerDiv.style.fontSize = '0.8rem';
        headerDiv.style.color = '#666';
        headerDiv.textContent = alert.header;

        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'small text-muted';
        detailsDiv.innerHTML = `
            <div><strong>Location:</strong> ${alert.locality}</div>
            <div><strong>Area:</strong> ${alert.warning_area}</div>
            <div><strong>Status:</strong> ${alert.current_status}</div>
            <div><strong>Published:</strong> ${alert.publish_date}</div>
        `;

        alertDiv.appendChild(warningLevelBadge);
        alertDiv.appendChild(titleDiv);
        alertDiv.appendChild(headerDiv);
        alertDiv.appendChild(detailsDiv);

        alertsContainer.appendChild(alertDiv);
    });

    // Add last updated timestamp
    if (data.last_updated) {
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'text-muted small mt-2 text-center';
        timestampDiv.textContent = `Last updated: ${data.last_updated}`;
        cardBody.appendChild(timestampDiv);
    }
}

function getAlertBackgroundColor(warningLevel) {
    const level = warningLevel.toLowerCase();
    switch (level) {
        case 'emergency warning':
            return '#f8d7da';
        case 'watch and act':
            return '#fff3cd';
        case 'advice':
            return '#d1ecf1';
        case 'information':
            return '#e2e3e5';
        default:
            return '#f8f9fa';
    }
}

function getAlertBadgeColor(warningLevel) {
    const level = warningLevel.toLowerCase();
    switch (level) {
        case 'emergency warning':
            return '#dc3545';
        case 'watch and act':
            return '#ffc107';
        case 'advice':
            return '#17a2b8';
        case 'information':
            return '#6c757d';
        default:
            return '#6c757d';
    }
}

// BOM Warnings functionality
async function fetchAndUpdateBOMWarnings() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';

    try {
        const response = await fetch(`${basePath}/api/bom_warnings`);
        const data = await response.json();
        updateBOMWarningsCard(data);
    } catch (error) {
        console.error('Error fetching BOM warnings:', error);
        updateBOMWarningsCard({ 
            marine_warnings: [], 
            land_warnings: [], 
            marine_count: 0, 
            land_count: 0, 
            error: 'Failed to fetch warnings' 
        });
    }
}

function updateBOMWarningsCard(data) {
    const cardBody = document.getElementById('bom-radar-body');
    if (!cardBody) return;

    // Clear existing content
    cardBody.innerHTML = '';
    
    // Ensure card body has proper display for vertical stacking
    cardBody.style.display = 'flex';
    cardBody.style.flexDirection = 'column';
    cardBody.style.width = '100%';

    if (data.error) {
        // Display error message
        const errorDiv = document.createElement('div');
        errorDiv.className = 'text-center text-muted';
        errorDiv.innerHTML = `
            <div class="mb-2">
                <i class="fas fa-exclamation-triangle"></i>
            </div>
            <div>Unable to load warnings</div>
            <small>${data.error}</small>
        `;
        cardBody.appendChild(errorDiv);
        return;
    }

    // Create warnings container
    const warningsContainer = document.createElement('div');
    warningsContainer.className = 'bom-warnings-container';
    warningsContainer.style.maxHeight = '300px';
    warningsContainer.style.overflowY = 'auto';
    warningsContainer.style.marginBottom = '15px';
    warningsContainer.style.width = '100%';
    warningsContainer.style.display = 'block';
    cardBody.appendChild(warningsContainer);

    // Marine Warnings Section
    const marineSection = document.createElement('div');
    marineSection.className = 'mb-4';
    
    const marineHeader = document.createElement('h6');
    marineHeader.className = 'fw-bold mb-2';
    marineHeader.style.color = '#0d6efd';
    marineHeader.innerHTML = `<i class="fas fa-water me-2"></i>Marine Warnings (${data.marine_count || 0})`;
    marineSection.appendChild(marineHeader);

    if (!data.marine_warnings || data.marine_warnings.length === 0) {
        const noMarineDiv = document.createElement('div');
        noMarineDiv.className = 'text-muted small';
        noMarineDiv.textContent = 'No current marine warnings';
        marineSection.appendChild(noMarineDiv);
    } else {
        data.marine_warnings.forEach((warning, index) => {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'alert alert-info alert-sm mb-2';
            warningDiv.style.fontSize = '0.85rem';
            
            const titleDiv = document.createElement('div');
            titleDiv.className = 'fw-bold mb-1';
            if (warning.link) {
                const titleLink = document.createElement('a');
                titleLink.href = warning.link;
                titleLink.target = '_blank';
                titleLink.textContent = warning.title;
                titleLink.style.color = 'inherit';
                titleLink.style.textDecoration = 'none';
                titleDiv.appendChild(titleLink);
            } else {
                titleDiv.textContent = warning.title;
            }
            
            const descDiv = document.createElement('div');
            descDiv.className = 'small';
            descDiv.textContent = warning.description;
            
            const metaDiv = document.createElement('div');
            metaDiv.className = 'text-muted small mt-1';
            metaDiv.textContent = `Published: ${warning.pubDate}`;
            
            warningDiv.appendChild(titleDiv);
            warningDiv.appendChild(descDiv);
            warningDiv.appendChild(metaDiv);
            marineSection.appendChild(warningDiv);
        });
    }
    
    warningsContainer.appendChild(marineSection);

    // Land Warnings Section
    const landSection = document.createElement('div');
    landSection.className = 'mb-4';
    
    const landHeader = document.createElement('h6');
    landHeader.className = 'fw-bold mb-2';
    landHeader.style.color = '#dc3545';
    landHeader.innerHTML = `<i class="fas fa-mountain me-2"></i>Land Warnings (${data.land_count || 0})`;
    landSection.appendChild(landHeader);

    if (!data.land_warnings || data.land_warnings.length === 0) {
        const noLandDiv = document.createElement('div');
        noLandDiv.className = 'text-muted small';
        noLandDiv.textContent = 'No current land warnings';
        landSection.appendChild(noLandDiv);
    } else {
        data.land_warnings.forEach((warning, index) => {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'alert alert-warning alert-sm mb-2';
            warningDiv.style.fontSize = '0.85rem';
            
            const titleDiv = document.createElement('div');
            titleDiv.className = 'fw-bold mb-1';
            if (warning.link) {
                const titleLink = document.createElement('a');
                titleLink.href = warning.link;
                titleLink.target = '_blank';
                titleLink.textContent = warning.title;
                titleLink.style.color = 'inherit';
                titleLink.style.textDecoration = 'none';
                titleDiv.appendChild(titleLink);
            } else {
                titleDiv.textContent = warning.title;
            }
            
            const descDiv = document.createElement('div');
            descDiv.className = 'small';
            descDiv.textContent = warning.description;
            
            const metaDiv = document.createElement('div');
            metaDiv.className = 'text-muted small mt-1';
            metaDiv.textContent = `Published: ${warning.pubDate}`;
            
            warningDiv.appendChild(titleDiv);
            warningDiv.appendChild(descDiv);
            warningDiv.appendChild(metaDiv);
            landSection.appendChild(warningDiv);
        });
    }
    
    warningsContainer.appendChild(landSection);

    // Add last updated timestamp BELOW the warnings
    if (data.last_updated) {
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'text-muted small text-center mb-2';
        timestampDiv.style.width = '100%';
        timestampDiv.style.display = 'block';
        timestampDiv.textContent = `Last updated: ${data.last_updated}`;
        cardBody.appendChild(timestampDiv);
    }

    // Add BOM attribution BELOW the warnings and timestamp
    const attributionDiv = document.createElement('div');
    attributionDiv.className = 'text-center';
    attributionDiv.style.width = '100%';
    attributionDiv.style.display = 'block';
    attributionDiv.style.borderTop = '1px solid #dee2e6';
    attributionDiv.style.paddingTop = '10px';
    attributionDiv.innerHTML = `
        <div class="small text-muted">
            <div class="mb-1">
                <a href="https://www.bom.gov.au" target="_blank" style="text-decoration: none; color: #6c757d;">
                    <strong>Bureau of Meteorology</strong>
                </a>
            </div>
            <div style="font-size: 0.75rem;">
                Weather warnings provided by the Australian Bureau of Meteorology
            </div>
        </div>
    `;
    cardBody.appendChild(attributionDiv);
} 

// Setup Images Modal functionality
function openSetupImageModal(imageSrc, imageTitle) {
    const modal = document.getElementById('setupImageModal');
    const modalImg = document.getElementById('setupModalImage');
    const modalTitle = document.getElementById('setupModalTitle');
    
    modal.style.display = "block";
    modalImg.src = imageSrc;
    modalTitle.textContent = imageTitle;
}

function closeSetupImageModal() {
    const modal = document.getElementById('setupImageModal');
    modal.style.display = "none";
}

// Add event listeners for setup image modal when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Setup Image Modal functionality
    const setupModal = document.getElementById('setupImageModal');
    
    // Close modal when clicking outside the image
    setupModal.addEventListener('click', function(e) {
        if (e.target === setupModal) {
            closeSetupImageModal();
        }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === "Escape" && setupModal.style.display === "block") {
            closeSetupImageModal();
        }
    });
});

// Top Stats functionality
async function fetchAndUpdateTopStats() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';

    try {
        const response = await fetch(`${basePath}/api/top_stats`);
        const data = await response.json();
        updateTopStatsCard(data);
    } catch (error) {
        console.error('Error fetching top stats:', error);
        updateTopStatsCard({ 
            error: 'Failed to fetch statistics',
            first_date: 'Unknown',
            max_temp: null,
            max_temp_date: 'Unknown',
            min_temp: null,
            min_temp_date: 'Unknown',
            max_humidity: null,
            max_humidity_temp: null,
            max_humidity_date: 'Unknown',
            max_wind_gust: null,
            max_wind_gust_date: 'Unknown',
            max_rainfall: null,
            max_rainfall_date: 'Unknown',
            max_uv: null,
            max_uv_date: 'Unknown',
            max_pm10: null,
            max_pm10_date: 'Unknown',
            max_lightning: null,
            max_lightning_date: 'Unknown'
        });
    }
}

function updateTopStatsCard(data) {
    // Update first date
    const firstDateElement = document.getElementById('first-date');
    if (firstDateElement) {
        firstDateElement.textContent = data.first_date || 'Unknown';
    }
    
    // Update maximum temperature
    const maxTempElement = document.getElementById('max-temp');
    const maxTempDateElement = document.getElementById('max-temp-date');
    if (maxTempElement && maxTempDateElement) {
        maxTempElement.textContent = data.max_temp !== null ? `${data.max_temp}°C` : '--°C';
        maxTempDateElement.textContent = data.max_temp_date || '--';
    }
    
    // Update minimum temperature
    const minTempElement = document.getElementById('min-temp');
    const minTempDateElement = document.getElementById('min-temp-date');
    if (minTempElement && minTempDateElement) {
        minTempElement.textContent = data.min_temp !== null ? `${data.min_temp}°C` : '--°C';
        minTempDateElement.textContent = data.min_temp_date || '--';
    }
    
    // Update maximum humidity
    const maxHumidityElement = document.getElementById('max-humidity');
    const maxHumidityTempElement = document.getElementById('max-humidity-temp');
    const maxHumidityDateElement = document.getElementById('max-humidity-date');
    if (maxHumidityElement && maxHumidityTempElement && maxHumidityDateElement) {
        maxHumidityElement.textContent = data.max_humidity !== null ? `${data.max_humidity}%` : '--%';
        maxHumidityTempElement.textContent = data.max_humidity_temp !== null ? `${data.max_humidity_temp}°C` : '--°C';
        maxHumidityDateElement.textContent = data.max_humidity_date || '--';
    }
    
    // Update maximum wind gust
    const maxWindGustElement = document.getElementById('max-wind-gust');
    const maxWindGustDateElement = document.getElementById('max-wind-gust-date');
    if (maxWindGustElement && maxWindGustDateElement) {
        maxWindGustElement.textContent = data.max_wind_gust !== null ? `${data.max_wind_gust} km/h` : '-- km/h';
        maxWindGustDateElement.textContent = data.max_wind_gust_date || '--';
    }
    
    // Update maximum rainfall
    const maxRainfallElement = document.getElementById('max-rainfall');
    const maxRainfallDateElement = document.getElementById('max-rainfall-date');
    if (maxRainfallElement && maxRainfallDateElement) {
        maxRainfallElement.textContent = data.max_rainfall !== null ? `${data.max_rainfall} mm` : '-- mm';
        maxRainfallDateElement.textContent = data.max_rainfall_date || '--';
    }
    
    // Update maximum UV
    const maxUVElement = document.getElementById('max-uv');
    const maxUVDateElement = document.getElementById('max-uv-date');
    const maxUVRiskElement = document.getElementById('max-uv-risk');
    if (maxUVElement && maxUVDateElement && maxUVRiskElement) {
        maxUVElement.textContent = data.max_uv !== null ? data.max_uv : '--';
        maxUVDateElement.textContent = data.max_uv_date || '--';
        maxUVRiskElement.textContent = data.max_uv_risk ? `(${data.max_uv_risk})` : '(Unknown)';
    }
    
    // Update maximum PM10
    const maxPM10Element = document.getElementById('max-pm10');
    const maxPM10DateElement = document.getElementById('max-pm10-date');
    const maxPM10LevelElement = document.getElementById('max-pm10-level');
    if (maxPM10Element && maxPM10DateElement && maxPM10LevelElement) {
        maxPM10Element.textContent = data.max_pm10 !== null ? data.max_pm10 : '--';
        maxPM10DateElement.textContent = data.max_pm10_date || '--';
        maxPM10LevelElement.textContent = data.max_pm10_level ? `(${data.max_pm10_level})` : '(Unknown)';
    }
    
    // Update maximum lightning strikes
    const maxLightningElement = document.getElementById('max-lightning');
    const maxLightningDateElement = document.getElementById('max-lightning-date');
    if (maxLightningElement && maxLightningDateElement) {
        maxLightningElement.textContent = data.max_lightning !== null ? data.max_lightning : '--';
        maxLightningDateElement.textContent = data.max_lightning_date || '--';
    }
}