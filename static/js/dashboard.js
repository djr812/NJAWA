/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Main initialization function that sets up all dashboard functionality when the DOM is loaded.
 * Initializes theme, charts, data updates, timelapse video, weather cam modal, and various API endpoints.
 *
 * @listens DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme
    initializeTheme();
    
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
    
    // Theme toggle functionality
    document.querySelectorAll('input[name="themeToggle"]').forEach(function(radio) {
        radio.addEventListener('change', function() {
            const theme = this.value;
            setTheme(theme);
            localStorage.setItem('theme', theme);
        });
    });
    
    // CSV download functionality
    document.querySelectorAll('.csv-download').forEach(function(item) {
        item.addEventListener('click', function(e) {
            e.preventDefault();
            const period = this.getAttribute('data-period');
            if (period) {
                downloadCSV(period);
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
    
    // Initialize Tides
    fetchAndUpdateTides();
    setInterval(fetchAndUpdateTides, 60 * 60 * 1000); // Update every hour
    
    // Initialize Dam Levels
    fetchAndUpdateDamLevels();
    setInterval(fetchAndUpdateDamLevels, 60 * 60 * 1000); // Update every hour
    
    // Initialize Weekly Statistics
    fetchAndUpdateWeeklyStats();
    setInterval(fetchAndUpdateWeeklyStats, 60 * 60 * 1000); // Update every hour
    
    // Initialize Comfort Levels
    fetchAndUpdateComfortLevels();
    setInterval(fetchAndUpdateComfortLevels, 5 * 60 * 1000); // Update every 5 minutes
    
    // Initialize Capital Cities
    fetchAndUpdateCapitalCities();
    setInterval(fetchAndUpdateCapitalCities, 60 * 60 * 1000); // Update every hour (matches cache TTL)
});

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Initializes the theme system by loading the saved theme from localStorage and applying it.
 * Sets the correct radio button state and applies the theme to the document.
 */
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    setTheme(savedTheme);
    
    // Set the correct radio button
    const radioButton = document.getElementById(savedTheme + 'Mode');
    if (radioButton) {
        radioButton.checked = true;
    }
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Sets the application theme and updates all UI elements including Plotly charts to match the theme.
 * Supports both light and dark themes with appropriate color schemes.
 *
 * @param {string} theme - The theme to apply ('light' or 'dark').
 */
function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelector('html').setAttribute('data-theme', theme);
    
    // Update Plotly charts theme if they exist
    if (window.Plotly) {
        const layout = {
            paper_bgcolor: theme === 'dark' ? '#333333' : '#ffffff',
            plot_bgcolor: theme === 'dark' ? '#333333' : '#ffffff',
            font: {
                color: theme === 'dark' ? '#ffffff' : '#000000'
            }
        };
        
        // Update all existing charts
        const chartDivs = document.querySelectorAll('.plotly-graph');
        chartDivs.forEach(div => {
            if (div.data && div.layout) {
                Plotly.relayout(div, layout);
            }
        });
    }
}

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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Fetches weather data and forecast from the API and updates all dashboard components.
 * Updates graphs, overlays, weather conditions, and period labels based on the current time period.
 *
 * @async
 */
function fetchAndUpdateAll() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';

    // Update timelapse date
    updateTimelapseDate();

    fetch(`${basePath}/api/data?period=${currentPeriod}`)
        .then(res => res.json())
        .then(async data => {
            latestData = data;
            updateInsideTempGraph(data);
            updateOutsideTempGraph(data);
            updateHumidityGraph(data);
            updatePressureGraph(data);
            await updateRainfallGraph(data);
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the predicted weather conditions card with AI forecast data including temperature ranges,
 * wind conditions, rain and lightning probabilities, and training information.
 *
 * @async
 * @param {Object} forecast - The forecast data object containing AI predictions and confidence levels.
 */
async function updatePredictedWeatherConditionsCard(forecast) {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';

    const cardBody = document.getElementById('predicted-weather-conditions-body');
    if (!cardBody) return;

    // Clear existing content
    cardBody.innerHTML = '';

    if (forecast && forecast.ai_forecast) {
        // Create main content container with responsive layout
        const mainContentContainer = document.createElement('div');
        mainContentContainer.style.display = 'flex';
        mainContentContainer.style.flexDirection = 'column';
        mainContentContainer.style.alignItems = 'center';
        mainContentContainer.style.justifyContent = 'center';
        mainContentContainer.style.marginBottom = '20px';
        mainContentContainer.style.width = '100%';
        cardBody.appendChild(mainContentContainer);

        // Top Section: Image and Condition (full width on mobile, left column on desktop)
        const topSection = document.createElement('div');
        topSection.style.display = 'flex';
        topSection.style.flexDirection = 'column';
        topSection.style.alignItems = 'center';
        topSection.style.justifyContent = 'center';
        topSection.style.width = '100%';
        topSection.style.padding = '0 10px';
        topSection.style.marginBottom = '20px';
        mainContentContainer.appendChild(topSection);

        // Create image element
        const img = document.createElement('img');
        img.src = `${basePath}/static/images/${forecast.ai_forecast}.png`;
        img.alt = forecast.ai_forecast;
        img.className = 'img-fluid weather-cam-img';
        img.style.maxHeight = '180px';
        img.style.marginBottom = '10px';
        topSection.appendChild(img);

        // Create text element for forecast
        const textDiv = document.createElement('div');
        textDiv.className = 'ai-forecast-text';
        textDiv.style.fontSize = '1.5rem';
        textDiv.style.fontWeight = 'bold';
        textDiv.style.textAlign = 'center';
        textDiv.style.marginBottom = '10px';
        textDiv.style.whiteSpace = 'nowrap';

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
        topSection.appendChild(textDiv);

        // Bottom Section: Temperature Range and Probabilities (full width)
        const bottomSection = document.createElement('div');
        bottomSection.style.display = 'flex';
        bottomSection.style.flexDirection = 'column';
        bottomSection.style.justifyContent = 'center';
        bottomSection.style.alignItems = 'center';
        bottomSection.style.width = '100%';
        bottomSection.style.padding = '0 10px';
        mainContentContainer.appendChild(bottomSection);

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
            bottomSection.appendChild(minTempDiv);
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
            bottomSection.appendChild(maxTempDiv);
        }

        // Add chance of rain with confidence
        if (forecast.chance_of_rain !== undefined) {
            const rainDiv = document.createElement('div');
            rainDiv.style.fontSize = '1.2rem';
            rainDiv.style.color = '#666';
            rainDiv.style.marginBottom = '15px';
            rainDiv.innerHTML = `Chance of Rain: ${forecast.chance_of_rain.toFixed(1)}% (Confidence ${forecast.chance_of_rain_confidence.toFixed(1)}%)`;
            bottomSection.appendChild(rainDiv);
        }

        // Add chance of lightning with confidence
        if (forecast.chance_of_lightning !== undefined) {
            const lightningDiv = document.createElement('div');
            lightningDiv.style.fontSize = '1.2rem';
            lightningDiv.style.color = '#666';
            lightningDiv.style.marginBottom = '15px';
            lightningDiv.innerHTML = `Chance of Lightning: ${forecast.chance_of_lightning.toFixed(1)}% (Confidence ${forecast.chance_of_lightning_confidence.toFixed(1)}%)`;
            bottomSection.appendChild(lightningDiv);
        }

        // Fetch and display training days
        try {
            const response = await fetch(`${basePath}/api/training_days`);
            const data = await response.json();
            
            // Create container for bottom text with consistent styling
            const bottomTextContainer = document.createElement('div');
            bottomTextContainer.style.marginTop = '0';
            bottomTextContainer.style.borderTop = '1px solid #dee2e6';
            bottomTextContainer.style.paddingTop = '10px';
            bottomTextContainer.style.paddingBottom = '5px';
            bottomTextContainer.style.backgroundColor = '#f8f9fa';
            bottomTextContainer.style.width = '100%';
            bottomTextContainer.style.boxSizing = 'border-box';
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Creates or updates a Plotly chart with the specified traces and layout configuration.
 * Handles theme-aware styling, responsive design, and automatic tick generation for time-based charts.
 *
 * @param {string} divId - The ID of the HTML element where the chart will be rendered.
 * @param {Array} traces - Array of trace objects defining the data series to plot.
 * @param {Object} layout - Layout configuration object for the chart appearance and behavior.
 * @param {boolean} legendAbove - Whether to position the legend above the chart (true) or use default positioning (false).
 */
function plotGraph(divId, traces, layout, legendAbove) {
    // Get current theme
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const isDark = currentTheme === 'dark';
    
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
            paper_bgcolor: isDark ? '#333333' : '#ffffff',
            plot_bgcolor: isDark ? '#333333' : '#ffffff',
            font: {
                color: isDark ? '#ffffff' : '#000000'
            },
            xaxis: {
                title: 'Time',
                tickangle: -45,
                automargin: true,
                tickvals: tickvals,
                ticktext: ticktext,
                gridcolor: isDark ? '#444444' : '#e1e5e9',
                color: isDark ? '#cccccc' : '#666666'
            },
            yaxis: {
                gridcolor: isDark ? '#444444' : '#e1e5e9',
                color: isDark ? '#cccccc' : '#666666'
            }
        }, layout);
    } else {
        layout = Object.assign({
            margin: { t: legendAbove ? 60 : 20 },
            autosize: true,
            height: 320,
            paper_bgcolor: isDark ? '#333333' : '#ffffff',
            plot_bgcolor: isDark ? '#333333' : '#ffffff',
            font: {
                color: isDark ? '#ffffff' : '#000000'
            },
            xaxis: {
                title: 'Time',
                tickangle: -45,
                automargin: true,
                gridcolor: isDark ? '#444444' : '#e1e5e9',
                color: isDark ? '#cccccc' : '#666666'
            },
            yaxis: {
                gridcolor: isDark ? '#444444' : '#e1e5e9',
                color: isDark ? '#cccccc' : '#666666'
            }
        }, layout);
    }
    if (legendAbove) {
        layout.legend = {
            orientation: 'h',
            yanchor: 'bottom',
            y: 1.12,
            xanchor: 'center',
            x: 0.5,
            bgcolor: isDark ? 'rgba(51, 51, 51, 0.8)' : 'rgba(255, 255, 255, 0.8)',
            bordercolor: isDark ? '#444444' : '#e1e5e9',
            font: {
                color: isDark ? '#ffffff' : '#000000'
            }
        };
    }
    Plotly.newPlot(divId, traces, layout, {responsive: true, displayModeBar: false, useResizeHandler: true});
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Sets the overlay value for a specified element with optional decimal formatting.
 * Updates the text content of the element with the formatted value and unit.
 *
 * @param {string} id - The ID of the HTML element to update.
 * @param {number|null} value - The numeric value to display, or null/undefined for '--'.
 * @param {string} unit - The unit of measurement to append to the value.
 * @param {number} [decimals=1] - Number of decimal places to format the value.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Formats a numeric value to a specified number of decimal places.
 *
 * @param {number} val - The numeric value to format.
 * @param {number} decimals - Number of decimal places to include.
 * @returns {string} The formatted number as a string.
 */
function formatValue(val, decimals) {
    return Number(val).toFixed(decimals);
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the inside temperature graph with the latest data and sets the overlay value.
 * Creates a line chart showing temperature trends over time.
 *
 * @param {Object} data - Weather data object containing dateTime and inTemp arrays.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the outside temperature graph with the latest data and sets the overlay value.
 * Creates a line chart showing temperature trends over time.
 *
 * @param {Object} data - Weather data object containing dateTime and outTemp arrays.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the outside temperature graph with forecast data overlay.
 * Re-renders the temperature chart if forecast data is available.
 *
 * @param {Object} forecast - Forecast data object containing temperature predictions.
 */
function updateForecastOnOutsideTemp(forecast) {
    if (latestData) updateOutsideTempGraph(latestData);
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the humidity graph showing both inside and outside humidity levels.
 * Creates a dual-line chart with legend positioned to the right of the chart.
 *
 * @param {Object} data - Weather data object containing dateTime, inHumidity, and outHumidity arrays.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the barometric pressure graph with the latest data and sets the overlay value.
 * Creates a line chart showing pressure trends over time.
 *
 * @param {Object} data - Weather data object containing dateTime and barometer arrays.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the rainfall graph with the latest data and fetches 24-hour rainfall total for overlay.
 * Creates a bar chart showing rainfall amounts and displays the 24-hour total in the overlay.
 *
 * @async
 * @param {Object} data - Weather data object containing dateTime and rain arrays.
 */
async function updateRainfallGraph(data) {
    plotGraph('rainfall-graph', [{
        x: data.dateTime,
        y: data.rain,
        type: 'bar',
        name: 'Rainfall',
        marker: { color: COLORS.tuftsBlue }
    }], {
        yaxis: { title: 'mm', rangemode: 'tozero', zeroline: true, zerolinewidth: 2, zerolinecolor: '#888' }
    });
    
    // Fetch 24-hour rainfall total for the overlay
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    let rainfall24h = 0;
    
    try {
        const rainfallResponse = await fetch(`${basePath}/api/rainfall_24h`);
        const rainfallData = await rainfallResponse.json();
        rainfall24h = rainfallData.total_rainfall_24h || 0;
    } catch (error) {
        console.error('Error fetching 24-hour rainfall for overlay:', error);
        rainfall24h = 0;
    }
    
    // Update overlay with 24-hour total
    const overlayElement = document.getElementById('rainfall-overlay');
    if (overlayElement) {
        overlayElement.textContent = `${rainfall24h.toFixed(1)}mm (24h)`;
    }
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the wind graph showing both wind speed and direction data.
 * Creates a dual-axis chart with wind speed as a line and wind direction as markers.
 *
 * @param {Object} data - Weather data object containing dateTime, windSpeed, and windDir arrays.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the wind chill graph with the latest data and sets the overlay value.
 * Creates a line chart showing wind chill temperature trends over time.
 *
 * @param {Object} data - Weather data object containing dateTime and windChill arrays.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the lightning graph showing both distance and strike count data.
 * Creates a grouped bar chart with distance bars only shown when strike count is 1 or more.
 *
 * @param {Object} data - Weather data object containing dateTime, lightning_distance, and lightning_strike_count arrays.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the solar graph showing both luminosity and UV index data.
 * Creates a dual-axis chart with solar radiation as a line and UV index as a separate line.
 *
 * @param {Object} data - Weather data object containing dateTime, luminosity, and uv arrays.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the heat index graph with the latest data and sets the overlay value.
 * Creates a line chart showing heat index temperature trends over time.
 *
 * @param {Object} data - Weather data object containing dateTime and heatIndex arrays.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Returns the last valid (non-null, non-undefined, non-NaN) value from an array.
 * Searches from the end of the array backwards to find the most recent valid value.
 *
 * @param {Array} arr - Array of values to search through.
 * @returns {*} The last valid value found, or null if no valid values exist.
 */
function lastValid(arr) {
    if (!arr || !arr.length) return null;
    for (let i = arr.length - 1; i >= 0; --i) {
        if (arr[i] !== null && arr[i] !== undefined && !isNaN(arr[i])) return arr[i];
    }
    return null;
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Sets the wind overlay display with formatted speed and direction information.
 * Converts wind direction from degrees to compass bearing and formats the display text.
 *
 * @param {number|null} speed - Wind speed in km/h, or null/undefined for '--'.
 * @param {number|null} dir - Wind direction in degrees, or null/undefined for '--'.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Converts wind direction from degrees to compass bearing (N, NE, E, SE, S, SW, W, NW).
 * Uses 16-point compass system with 22.5-degree sectors for each direction.
 *
 * @param {number} deg - Wind direction in degrees (0-360).
 * @returns {string} Compass bearing as a string (N, NE, E, SE, S, SW, W, NW, or '--' for invalid values).
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the period labels for all graph sections based on the current time period and screen size.
 * Shows abbreviated labels on smaller screens and full descriptions on larger screens.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the current time display in Brisbane, Australia timezone.
 * Shows both time and date in a formatted string.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Parses a local time string in 'h:mm:ss AM/PM' format and converts it to a Date object.
 * Creates the date in Brisbane timezone for sunrise/sunset calculations.
 *
 * @param {string} timeStr - Time string in 'h:mm:ss AM/PM' format.
 * @returns {Date} Date object representing the parsed time in Brisbane timezone.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Fetches sunrise and sunset times from the sunrise-sunset.org API for Brisbane coordinates.
 * Updates the display with formatted times and stores the parsed times for weather cam functionality.
 *
 * @async
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Schedules the next sunrise/sunset update to occur at 00:01 the following day.
 * Uses setTimeout to ensure daily updates of sunrise and sunset information.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Determines if the weather camera should be active based on sunrise and sunset times.
 * Returns true if current time is within 15 minutes before sunrise to 15 minutes after sunset.
 *
 * @returns {boolean} True if camera should be active, false otherwise.
 */
function isCamActiveNow() {
    if (!sunriseTime || !sunsetTime) return true; // fallback: always active
    const now = new Date();
    const beforeSunrise = new Date(sunriseTime.getTime() - 15 * 60 * 1000);
    const afterSunset = new Date(sunsetTime.getTime() + 15 * 60 * 1000);
    return now >= beforeSunrise && now <= afterSunset;
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Refreshes the weather camera image with cache-busting and handles offline overlay.
 * Shows/hides offline overlay based on camera active status and updates image source with timestamp.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the weather camera timestamp display with the last modified time of the image.
 * Fetches the image headers to get the Last-Modified date and formats it for display.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Fetches battery status for all weather station components from the API.
 * Updates the battery status display for console, outdoor sensor, solar array, and lightning detector.
 *
 * @async
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the battery status display for all weather station components.
 * Calls updateBatteryCard for each component type with their respective status information.
 *
 * @param {Object} data - Battery status data object containing status for each component.
 */
function updateBatteryStatus(data) {
    updateBatteryCard('console', data.console);
    updateBatteryCard('outdoor', data.outdoor);
    updateBatteryCard('array', data.array);
    updateBatteryCard('lightning', data.lightning);
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the battery status card for a specific component type.
 * Sets the appropriate SVG icon and status text based on battery health.
 *
 * @param {string} type - Component type ('console', 'outdoor', 'array', or 'lightning').
 * @param {Object} info - Battery information object containing status and label properties.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Fetches bar area metrics including temperature, humidity, CO2, and particulate matter data.
 * Updates all bar area displays including comfort level calculations.
 *
 * @async
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the bar area temperature and humidity displays and calculates comfort level.
 * Parses temperature and humidity values from strings and updates the comfort level card.
 *
 * @param {Object} data - Bar metrics data object containing bar_area_temp and bar_area_humidity.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the outside CO2 level card with value, scale rating, and appropriate styling.
 * Determines air quality scale based on CO2 concentration and updates background color and image.
 *
 * @param {Object} data - Bar metrics data object containing outside_co2 value.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the PM2.5 particulate matter card with value, scale rating, and appropriate styling.
 * Determines air quality scale based on PM2.5 concentration and updates background color and image.
 *
 * @param {Object} data - Bar metrics data object containing pm25 value.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the PM10 particulate matter card with value, scale rating, and appropriate styling.
 * Determines air quality scale based on PM10 concentration and updates background color and image.
 *
 * @param {Object} data - Bar metrics data object containing pm10 value.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the timelapse video date display with the last modified time of the video file.
 * Fetches the video file headers to get the Last-Modified date and formats it for display.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the bar area comfort level card based on temperature and humidity values.
 * Determines comfort level (Chilly, Perfect, Good, Reasonable, Toasty, Way too hot) and updates styling.
 *
 * @param {number|null} temp - Temperature in Celsius, or null if unavailable.
 * @param {number|null} humidity - Humidity percentage, or null if unavailable.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the outside CO2 display with formatted value and unit.
 * Legacy function for simple CO2 value display without scale ratings.
 *
 * @param {Object} data - Data object containing outside_co2 value.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the outside PM2.5 display with formatted value and unit.
 * Legacy function for simple PM2.5 value display without scale ratings.
 *
 * @param {Object} data - Data object containing outside_pm25 value.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the outside PM10 display with formatted value and unit.
 * Legacy function for simple PM10 value display without scale ratings.
 *
 * @param {Object} data - Data object containing outside_pm10 value.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Determines the current weather condition by calling the weather condition API.
 * Returns weather text and icon information based on current meteorological data.
 *
 * @async
 * @param {Object} data - Weather data object containing current meteorological readings.
 * @returns {Object} Object containing weather text and icon information.
 * @returns {string} returns.text - Description of current weather condition.
 * @returns {string|null} returns.icon - Path to weather condition icon, or null if unavailable.
 *
 * @throws {Error} When API call fails or returns invalid response.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the actual weather conditions card with current meteorological data.
 * Displays weather condition, temperature, pressure, rainfall, UV, humidity, wind, and lightning information.
 *
 * @async
 * @param {Object} data - Weather data object containing current meteorological readings.
 */
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
        windGust: getValue(data.windGust),
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
        rainfall24h = rainfallData.total_rainfall_24h || 0;
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
    
    // Clear existing content
    cardBody.innerHTML = '';

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
    
    // Create the main content container with flexbox column layout
    const mainContentContainer = document.createElement('div');
    mainContentContainer.className = 'weather-condition';
    mainContentContainer.style.display = 'flex';
    mainContentContainer.style.flexDirection = 'column';
    mainContentContainer.style.width = '100%';
    mainContentContainer.style.height = '100%';
    cardBody.appendChild(mainContentContainer);

    // Add white space at the top
    const topSpacerDiv = document.createElement('div');
    topSpacerDiv.style.height = '15px';
    mainContentContainer.appendChild(topSpacerDiv);

    // Create the three-column layout using CSS Grid
    const threeColumnGrid = document.createElement('div');
    threeColumnGrid.style.display = 'grid';
    threeColumnGrid.style.gridTemplateColumns = '1fr 1fr 1fr';
    threeColumnGrid.style.gap = '1rem';
    threeColumnGrid.style.width = '100%';
    threeColumnGrid.style.flexGrow = '1';
    mainContentContainer.appendChild(threeColumnGrid);

    // Column 1: Image and Condition
    const column1 = document.createElement('div');
    column1.style.display = 'flex';
    column1.style.flexDirection = 'column';
    column1.style.justifyContent = 'center';
    column1.style.alignItems = 'center';
    column1.style.textAlign = 'center';
    
    const img = document.createElement('img');
    img.src = imageSrc;
    img.alt = condition.text;
    img.style.height = '180px';
    img.style.width = 'auto';
    img.style.marginBottom = '1rem';
    img.style.objectFit = 'contain';
    column1.appendChild(img);
    
    const conditionText = document.createElement('div');
    conditionText.className = 'h2';
    conditionText.style.fontWeight = '700';
    conditionText.textContent = condition.text;
    column1.appendChild(conditionText);
    
    threeColumnGrid.appendChild(column1);

    // Column 2: Temperature, Pressure, Rain, UV
    const column2 = document.createElement('div');
    column2.style.display = 'flex';
    column2.style.flexDirection = 'column';
    column2.style.justifyContent = 'space-around';
    
    const tempDiv = document.createElement('div');
    tempDiv.className = 'mb-4';
    tempDiv.innerHTML = `
        <div class="h6 mb-1" style="color: #666;">TEMPERATURE</div>
        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(latest.outTemp)}°C</div>
    `;
    column2.appendChild(tempDiv);
    
    const pressureDiv = document.createElement('div');
    pressureDiv.className = 'mb-4';
    pressureDiv.innerHTML = `
        <div class="h6 mb-1" style="color: #666;">REL. AIR PRESSURE</div>
        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(latest.barometer)} hPa</div>
    `;
    column2.appendChild(pressureDiv);
    
    const rainDiv = document.createElement('div');
    rainDiv.className = 'mb-4';
    rainDiv.innerHTML = `
        <div class="h6 mb-1" style="color: #666;">RAIN (24H)</div>
        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(rainfall24h)} mm</div>
    `;
    column2.appendChild(rainDiv);
    
    const uvDiv = document.createElement('div');
    uvDiv.className = 'mb-4';
    uvDiv.innerHTML = `
        <div class="h6 mb-1" style="color: #666;">UV RATING</div>
        <div style="font-size: 1.5rem; font-weight: 700;">${latest.UV === 0 ? '0' : (latest.UV || '--')}</div>
    `;
    column2.appendChild(uvDiv);
    
    threeColumnGrid.appendChild(column2);

    // Column 3: Humidity, Wind, Lightning
    const column3 = document.createElement('div');
    column3.style.display = 'flex';
    column3.style.flexDirection = 'column';
    column3.style.justifyContent = 'space-around';
    
    const humidityDiv = document.createElement('div');
    humidityDiv.className = 'mb-4';
    humidityDiv.innerHTML = `
        <div class="h6 mb-1" style="color: #666;">HUMIDITY</div>
        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(latest.outHumidity)}%</div>
    `;
    column3.appendChild(humidityDiv);
    
    const windGustDiv = document.createElement('div');
    windGustDiv.className = 'mb-4';
    windGustDiv.innerHTML = `
        <div class="h6 mb-1" style="color: #666;">WIND GUST</div>
        <div style="font-size: 1.5rem; font-weight: 700;">${formatNumber(latest.windGust)} km/h</div>
    `;
    column3.appendChild(windGustDiv);
    
    const windDirDiv = document.createElement('div');
    windDirDiv.className = 'mb-4';
    windDirDiv.innerHTML = `
        <div class="h6 mb-1" style="color: #666;">WIND DIRECTION</div>
        <div style="font-size: 1.5rem; font-weight: 700;">${degreesToCompass(latest.windDir)}</div>
    `;
    column3.appendChild(windDirDiv);
    
    const lightningDiv = document.createElement('div');
    lightningDiv.className = 'mb-4';
    lightningDiv.innerHTML = `
        <div class="h6 mb-1" style="color: #666;">LIGHTNING STRIKES</div>
        <div style="font-size: 1.5rem; font-weight: 700;">${latest.lightning_strike_count === 0 ? '0' : (latest.lightning_strike_count || '--')}</div>
    `;
    column3.appendChild(lightningDiv);
    
    threeColumnGrid.appendChild(column3);
    
    // Add white space between main content and bottom section (reduced to compensate for top spacer)
    const spacerDiv = document.createElement('div');
    spacerDiv.style.flexGrow = '1';
    spacerDiv.style.minHeight = '5px';
    mainContentContainer.appendChild(spacerDiv);
    
    // Last updated timestamp (above the horizontal line)
    const lastUpdatedDiv = document.createElement('div');
    lastUpdatedDiv.className = 'last-updated-text';
    lastUpdatedDiv.style.fontSize = '0.9rem';
    lastUpdatedDiv.style.color = '#666';
    lastUpdatedDiv.style.textAlign = 'center';
    lastUpdatedDiv.style.marginBottom = '10px';
    lastUpdatedDiv.textContent = `Last Updated: ${new Date().toLocaleString('en-AU', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    })}`;
    mainContentContainer.appendChild(lastUpdatedDiv);

    // Add bottom text container with horizontal line and attribution
    const bottomTextContainer = document.createElement('div');
    bottomTextContainer.style.borderTop = '1px solid #dee2e6';
    bottomTextContainer.style.paddingTop = '10px';
    bottomTextContainer.style.paddingBottom = '5px';
    bottomTextContainer.style.backgroundColor = '#f8f9fa';
    bottomTextContainer.style.width = '100%';
    bottomTextContainer.style.boxSizing = 'border-box';
    mainContentContainer.appendChild(bottomTextContainer);

    // Attribution text
    const attributionDiv = document.createElement('div');
    attributionDiv.className = 'attribution-text';
    attributionDiv.style.fontSize = '0.9rem';
    attributionDiv.style.color = '#666';
    attributionDiv.style.textAlign = 'center';
    attributionDiv.style.marginBottom = '5px';
    attributionDiv.textContent = 'Weather Telemetry Provided by an Ecowitt WS69 Personal Weather Station';
    bottomTextContainer.appendChild(attributionDiv);

    // Additional attribution text
    const additionalAttributionDiv = document.createElement('div');
    additionalAttributionDiv.className = 'additional-attribution-text';
    additionalAttributionDiv.style.fontSize = '0.9rem';
    additionalAttributionDiv.style.color = '#666';
    additionalAttributionDiv.style.textAlign = 'center';
    additionalAttributionDiv.textContent = 'Condition and Icon provided by WeatherAPI.com';
    bottomTextContainer.appendChild(additionalAttributionDiv);
    
    console.log('Updated card with condition:', condition);
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Initializes all Chart.js charts for the dashboard including temperature, rainfall, and lightning charts.
 * Sets up responsive chart configurations with appropriate styling and data bindings.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Determines UV risk level and time to sunburn based on UV index value.
 * Returns risk assessment and sunburn time information for UV safety guidance.
 *
 * @param {number} uvIndex - UV index value to assess.
 * @returns {Object} Object containing risk level and time to sunburn information.
 * @returns {string} returns.riskLevel - Risk level description (Low, Moderate, High, Very High, Extreme).
 * @returns {string} returns.timeToBurn - Estimated time to sunburn for the UV level.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the UV Level card with current UV index, risk level, and appropriate styling.
 * Sets background color, risk level text, and image based on UV index value.
 *
 * @param {number} uvIndex - Current UV index value to display.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates weather data by fetching current weather condition and updating the actual weather conditions card.
 * Called periodically to keep weather information current.
 *
 * @async
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Fetches Queensland Fire and Emergency Services (QFES) alerts for the Ferny Grove area.
 * Updates the QFD alerts card with current emergency warnings and information.
 *
 * @async
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the QFD alerts card with emergency warning information.
 * Displays alerts with warning levels, titles, descriptions, and metadata in a scrollable container.
 *
 * @param {Object} data - QFD alerts data object containing alerts array and metadata.
 * @param {Array} data.alerts - Array of alert objects with warning information.
 * @param {number} data.count - Number of active alerts.
 * @param {string} [data.error] - Error message if alerts could not be fetched.
 */
function updateQFDAlertsCard(data) {
    const cardBody = document.getElementById('qfd-alerts-body');
    if (!cardBody) return;

    console.log('QFD Alerts data:', data); // Debug log

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
    } else {
        // Create alerts container
        const alertsContainer = document.createElement('div');
        alertsContainer.className = 'qfd-alerts-container';
        alertsContainer.style.maxHeight = '150px'; // Even smaller to ensure bottom sections are visible
        alertsContainer.style.overflowY = 'auto';
        alertsContainer.style.marginBottom = '10px';
        alertsContainer.style.width = '100%';
        alertsContainer.style.display = 'block';
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
    }

    // Add spacer to push bottom sections to the bottom of the card
    const spacerDiv = document.createElement('div');
    spacerDiv.style.flexGrow = '1';
    spacerDiv.style.minHeight = '20px';
    cardBody.appendChild(spacerDiv);

    // Add last updated timestamp at the bottom
    if (data.last_updated) {
        const timestampDiv = document.createElement('div');
        timestampDiv.className = 'text-muted small text-center mb-2';
        timestampDiv.style.width = '100%';
        timestampDiv.style.display = 'block';
        timestampDiv.style.paddingTop = '10px';
        // Use the actual last updated time from the data if available, otherwise use current time
        let formatted;
        if (data.last_updated) {
            // Parse the date string "03-07-2025 13:43:40" format from cache file
            const dateParts = data.last_updated.split(' ')[0].split('-'); // ["03", "07", "2025"]
            const timeParts = data.last_updated.split(' ')[1].split(':'); // ["13", "43", "40"]
            
            // Detect if the date is mm-dd-yyyy and swap if needed
            let day = dateParts[0], month = dateParts[1], year = dateParts[2];
            if (parseInt(dateParts[0]) <= 12 && parseInt(dateParts[1]) > 12) {
                // Looks like mm-dd-yyyy, swap
                [day, month] = [month, day];
            }
            const hour = parseInt(timeParts[0]);
            const minute = timeParts[1];
            
            // Convert to 12-hour format with AM/PM
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12; // 0 becomes 12 for 12 AM
            
            formatted = `Last Updated: ${day}/${month}/${year} ${displayHour.toString().padStart(2, '0')}:${minute} ${ampm}`;
        } else {
            // Fallback to current time if no last_updated
            const now = new Date();
            const options = {
                timeZone: 'Australia/Brisbane',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            };
            const localeString = now.toLocaleString('en-AU', options);
            const [datePart, timePart] = localeString.split(', ');
            formatted = `Last Updated: ${datePart} ${timePart.toUpperCase()}`;
        }
        timestampDiv.textContent = formatted;
        cardBody.appendChild(timestampDiv);
    }

    // Add QFD attribution at the very bottom
    const attributionDiv = document.createElement('div');
    attributionDiv.className = 'text-center';
    attributionDiv.style.width = '100%';
    attributionDiv.style.display = 'block';
    attributionDiv.style.borderTop = '1px solid #dee2e6';
    attributionDiv.style.paddingTop = '10px';
    attributionDiv.style.paddingBottom = '5px';
    attributionDiv.style.backgroundColor = '#f8f9fa';
    attributionDiv.innerHTML = `
        <div class="small text-muted">
            <div class="mb-1">
                <a href="https://www.qfes.qld.gov.au" target="_blank" style="text-decoration: none; color: #6c757d;">
                    <strong>Queensland Fire Department</strong>
                </a>
            </div>
            <div style="font-size: 0.75rem;">
                Active alerts provided by the Queensland Fire Department
            </div>
        </div>
    `;
    cardBody.appendChild(attributionDiv);
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Returns the appropriate background color for alert styling based on warning level.
 * Maps warning levels to color-coded background colors for visual alert categorization.
 *
 * @param {string} warningLevel - Warning level string (Emergency Warning, Watch and Act, Advice, Information).
 * @returns {string} CSS color value for the alert background.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Returns the appropriate badge color for alert styling based on warning level.
 * Maps warning levels to color-coded badge colors for visual alert categorization.
 *
 * @param {string} warningLevel - Warning level string (Emergency Warning, Watch and Act, Advice, Information).
 * @returns {string} CSS color value for the alert badge.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Fetches Bureau of Meteorology (BOM) warnings including marine and land warnings.
 * Updates the BOM warnings card with current weather warnings and alerts.
 *
 * @async
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the BOM warnings card with marine and land warning information.
 * Displays warnings in separate sections with links, descriptions, and metadata.
 *
 * @param {Object} data - BOM warnings data object containing marine and land warnings.
 * @param {Array} data.marine_warnings - Array of marine warning objects.
 * @param {Array} data.land_warnings - Array of land warning objects.
 * @param {number} data.marine_count - Number of active marine warnings.
 * @param {number} data.land_count - Number of active land warnings.
 * @param {string} [data.error] - Error message if warnings could not be fetched.
 */
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
        timestampDiv.style.paddingTop = '10px';
        timestampDiv.style.marginTop = '50px';
        // Use the actual last updated time from the data if available, otherwise use current time
        let formatted;
        if (data.last_updated) {
            // Parse the date string "03-07-2025 10:18:56" format from cache file
            const dateParts = data.last_updated.split(' ')[0].split('-'); // ["03", "07", "2025"]
            const timeParts = data.last_updated.split(' ')[1].split(':'); // ["10", "18", "56"]
            
            // Detect if the date is mm-dd-yyyy and swap if needed
            let day = dateParts[0], month = dateParts[1], year = dateParts[2];
            if (parseInt(dateParts[0]) <= 12 && parseInt(dateParts[1]) > 12) {
                // Looks like mm-dd-yyyy, swap
                [day, month] = [month, day];
            }
            const hour = parseInt(timeParts[0]);
            const minute = timeParts[1];
            
            // Convert to 12-hour format with AM/PM
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12; // 0 becomes 12 for 12 AM
            
            formatted = `Last Updated: ${day}/${month}/${year} ${displayHour.toString().padStart(2, '0')}:${minute} ${ampm}`;
        } else {
            // Fallback to current time if no last_updated
            const now = new Date();
            const options = {
                timeZone: 'Australia/Brisbane',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            };
            const localeString = now.toLocaleString('en-AU', options);
            const [datePart, timePart] = localeString.split(', ');
            formatted = `Last Updated: ${datePart} ${timePart.toUpperCase()}`;
        }
        timestampDiv.textContent = formatted;
        cardBody.appendChild(timestampDiv);
    }

    // Add BOM attribution BELOW the warnings and timestamp
    const attributionDiv = document.createElement('div');
    attributionDiv.className = 'text-center';
    attributionDiv.style.width = '100%';
    attributionDiv.style.display = 'block';
    attributionDiv.style.borderTop = '1px solid #dee2e6';
    attributionDiv.style.paddingTop = '10px';
    attributionDiv.style.paddingBottom = '5px';
    attributionDiv.style.backgroundColor = '#f8f9fa'; // Light background to make it more visible
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Opens the setup image modal with the specified image and title.
 * Displays a modal dialog showing weather station setup images in full size.
 *
 * @param {string} imageSrc - Source URL of the image to display in the modal.
 * @param {string} imageTitle - Title text to display in the modal header.
 */
function openSetupImageModal(imageSrc, imageTitle) {
    const modal = document.getElementById('setupImageModal');
    const modalImg = document.getElementById('setupModalImage');
    const modalTitle = document.getElementById('setupModalTitle');
    
    modal.style.display = "block";
    modalImg.src = imageSrc;
    modalTitle.textContent = imageTitle;
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Closes the setup image modal by hiding the modal element.
 * Hides the modal dialog and clears the displayed image and title.
 */
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

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Fetches top statistics data including maximum and minimum values for all weather metrics.
 * Updates the top stats card with historical record information and ticker feed.
 *
 * @async
 */
async function fetchAndUpdateTopStats() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';

    try {
        // Fetch both top stats and 24-hour weather data
        const [topStatsResponse, weather24hResponse] = await Promise.all([
            fetch(`${basePath}/api/top_stats`),
            fetch(`${basePath}/api/weather_24h`)
        ]);
        
        const topStatsData = await topStatsResponse.json();
        const weather24hData = await weather24hResponse.json();
        
        // Combine the data
        const combinedData = {
            ...topStatsData,
            ...weather24hData
        };
        
        updateTopStatsCard(combinedData);
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
            max_lightning_date: 'Unknown',
            max_temp_24h: null,
            min_temp_24h: null,
            max_wind_gust_24h: null,
            max_wind_gust_direction_24h: null,
            total_rainfall_24h: null
        });
    }
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the top statistics card with historical record data for all weather metrics.
 * Displays maximum and minimum values with dates for temperature, humidity, wind, rainfall, UV, PM10, and lightning.
 *
 * @param {Object} data - Top statistics data object containing maximum and minimum values with dates.
 */
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
    
    // Update ticker feed
    updateTickerFeed(data);
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the ticker feed with top statistics data for continuous scrolling display.
 * Formats values with appropriate units and ratings, and calculates animation duration for smooth scrolling.
 *
 * @param {Object} data - Top statistics data object containing maximum values and dates for ticker display.
 */
function updateTickerFeed(data) {
    // Helper function to get UV rating
    function getUVRating(uvValue) {
        if (uvValue === null || uvValue === undefined) return '(Unknown)';
        if (uvValue >= 11) return '(Extreme)';
        else if (uvValue >= 8) return '(Very High)';
        else if (uvValue >= 6) return '(High)';
        else if (uvValue >= 3) return '(Moderate)';
        else return '(Low)';
    }
    
    // Helper function to get PM10 rating
    function getPM10Rating(pm10Value) {
        if (pm10Value === null || pm10Value === undefined) return '(Unknown)';
        if (pm10Value > 250.4) return '(Hazardous)';
        else if (pm10Value > 150.4) return '(Severe)';
        else if (pm10Value > 55.4) return '(Unhealthy)';
        else if (pm10Value > 35.4) return '(Poor)';
        else if (pm10Value > 12) return '(Moderate)';
        else return '(Good)';
    }
    
    // Update ticker elements with values, dates, and ratings
    const tickerUpdates = [
        { valueId: 'ticker-max-temp', value: data.max_temp !== null ? `${data.max_temp}°C` : '--°C', dateId: 'ticker-max-temp-date', date: data.max_temp_date },
        { valueId: 'ticker-min-temp', value: data.min_temp !== null ? `${data.min_temp}°C` : '--°C', dateId: 'ticker-min-temp-date', date: data.min_temp_date },
        { valueId: 'ticker-max-humidity', value: data.max_humidity !== null ? `${data.max_humidity}%` : '--%', dateId: 'ticker-max-humidity-date', date: data.max_humidity_date, tempId: 'ticker-max-humidity-temp', temp: data.max_humidity_temp },
        { valueId: 'ticker-max-wind-gust', value: data.max_wind_gust !== null ? `${data.max_wind_gust} km/h from ${data.max_wind_gust_direction || '--'}` : '-- km/h', dateId: 'ticker-max-wind-gust-date', date: data.max_wind_gust_date, directionId: 'ticker-max-wind-gust-direction', direction: data.max_wind_gust_direction },
        { valueId: 'ticker-max-rainfall', value: data.max_rainfall !== null ? `${data.max_rainfall} mm` : '-- mm', dateId: 'ticker-max-rainfall-date', date: data.max_rainfall_date },
        { valueId: 'ticker-max-uv', value: data.max_uv !== null ? data.max_uv : '--', dateId: 'ticker-max-uv-date', date: data.max_uv_date, ratingId: 'ticker-max-uv-rating', rating: getUVRating(data.max_uv) },
        { valueId: 'ticker-max-pm10', value: data.max_pm10 !== null ? data.max_pm10 : '--', dateId: 'ticker-max-pm10-date', date: data.max_pm10_date, ratingId: 'ticker-max-pm10-rating', rating: getPM10Rating(data.max_pm10) },
        { valueId: 'ticker-max-lightning', value: data.max_lightning !== null ? data.max_lightning : '--', dateId: 'ticker-max-lightning-date', date: data.max_lightning_date },
        { valueId: 'ticker-24h-max-temp', value: data.max_temp_24h !== null ? `${data.max_temp_24h}°C` : '--°C' },
        { valueId: 'ticker-24h-min-temp', value: data.min_temp_24h !== null ? `${data.min_temp_24h}°C` : '--°C' },
        { valueId: 'ticker-24h-max-wind-gust', value: data.max_wind_gust_24h !== null ? `${data.max_wind_gust_24h} km/h` : '-- km/h' },
        { valueId: 'ticker-24h-max-wind-gust-direction', value: data.max_wind_gust_direction_24h || '--' },
        { valueId: 'ticker-24h-total-rainfall', value: data.total_rainfall_24h !== null ? `${data.total_rainfall_24h} mm` : '-- mm' }
    ];
    
    // Update all ticker elements
    tickerUpdates.forEach(update => {
        // Update value element
        const valueElement = document.getElementById(update.valueId);
        if (valueElement) {
            valueElement.textContent = update.value;
        }
        
        // Update date element
        const dateElement = document.getElementById(update.dateId);
        if (dateElement) {
            if (update.date) {
                // Format the date for display
                const date = new Date(update.date);
                const formattedDate = date.toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
                dateElement.textContent = formattedDate;
            } else {
                dateElement.textContent = '--';
            }
        }
        
        // Update temperature element (for humidity)
        if (update.tempId) {
            const tempElement = document.getElementById(update.tempId);
            if (tempElement) {
                tempElement.textContent = update.temp !== null ? `${update.temp}°C` : '--°C';
            }
        }
        
        // Update direction element (for wind gust)
        if (update.directionId) {
            const directionElement = document.getElementById(update.directionId);
            if (directionElement) {
                directionElement.textContent = update.direction || '--';
            }
        }
        
        // Update rating element (for UV and PM10)
        if (update.ratingId) {
            const ratingElement = document.getElementById(update.ratingId);
            if (ratingElement) {
                ratingElement.textContent = update.rating;
            }
        }
        
        // Also update the duplicate elements for seamless loop
        const valueElement2 = document.getElementById(update.valueId + '-2');
        if (valueElement2) {
            valueElement2.textContent = update.value;
        }
        
        const dateElement2 = document.getElementById(update.dateId + '-2');
        if (dateElement2) {
            if (update.date) {
                // Format the date for display
                const date = new Date(update.date);
                const formattedDate = date.toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                });
                dateElement2.textContent = formattedDate;
            } else {
                dateElement2.textContent = '--';
            }
        }
        
        // Update duplicate temperature element (for humidity)
        if (update.tempId) {
            const tempElement2 = document.getElementById(update.tempId + '-2');
            if (tempElement2) {
                tempElement2.textContent = update.temp !== null ? `${update.temp}°C` : '--°C';
            }
        }
        
        // Update duplicate direction element (for wind gust)
        if (update.directionId) {
            const directionElement2 = document.getElementById(update.directionId + '-2');
            if (directionElement2) {
                directionElement2.textContent = update.direction || '--';
            }
        }
        
        // Update duplicate rating element (for UV and PM10)
        if (update.ratingId) {
            const ratingElement2 = document.getElementById(update.ratingId + '-2');
            if (ratingElement2) {
                ratingElement2.textContent = update.rating;
            }
        }
    });
    
    // Update duplicate 24-hour weather elements
    const duplicate24hUpdates = [
        { valueId: 'ticker-24h-max-temp', value: data.max_temp_24h !== null ? `${data.max_temp_24h}°C` : '--°C' },
        { valueId: 'ticker-24h-min-temp', value: data.min_temp_24h !== null ? `${data.min_temp_24h}°C` : '--°C' },
        { valueId: 'ticker-24h-max-wind-gust', value: data.max_wind_gust_24h !== null ? `${data.max_wind_gust_24h} km/h` : '-- km/h' },
        { valueId: 'ticker-24h-max-wind-gust-direction', value: data.max_wind_gust_direction_24h || '--' },
        { valueId: 'ticker-24h-total-rainfall', value: data.total_rainfall_24h !== null ? `${data.total_rainfall_24h} mm` : '-- mm' }
    ];
    
    duplicate24hUpdates.forEach(update => {
        const valueElement2 = document.getElementById(update.valueId + '-2');
        if (valueElement2) {
            valueElement2.textContent = update.value;
        }
    });
    
    // Calculate and set animation duration for smooth continuous scrolling
    setTimeout(() => {
        const tickerContent = document.querySelector('.ticker-content');
        if (tickerContent) {
            const contentWidth = tickerContent.scrollWidth;
            const containerWidth = tickerContent.parentElement.offsetWidth;
            
            // Calculate duration based on content width (50% of total content since we have duplicates)
            // Use a base speed of 50 pixels per second for smooth scrolling
            const baseSpeed = 50; // pixels per second
            const duration = (contentWidth / 2) / baseSpeed; // Duration for half the content
            
            // Set minimum and maximum duration limits
            const minDuration = 30; // seconds
            const maxDuration = 120; // seconds
            const finalDuration = Math.max(minDuration, Math.min(maxDuration, duration));
            
            tickerContent.style.animationDuration = `${finalDuration}s`;
        }
    }, 100); // Small delay to ensure content is rendered
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the risk level display for UV or PM10 values with color-coded badges.
 * Sets appropriate Bootstrap badge styling based on the value and type of measurement.
 *
 * @param {string} elementId - ID of the HTML element to update with the risk level badge.
 * @param {number} value - Numeric value to assess for risk level (UV index or PM10 concentration).
 * @param {string} type - Type of measurement ('uv' or 'pm10') to determine risk thresholds.
 */
function updateRiskLevel(elementId, value, type) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    let rating, color;
    
    if (type === 'uv') {
        if (value <= 2) { rating = 'Low'; color = 'success'; }
        else if (value <= 5) { rating = 'Moderate'; color = 'warning'; }
        else if (value <= 7) { rating = 'High'; color = 'danger'; }
        else if (value <= 10) { rating = 'Very High'; color = 'danger'; }
        else { rating = 'Extreme'; color = 'danger'; }
    } else if (type === 'pm10') {
        if (value <= 20) { rating = 'Good'; color = 'success'; }
        else if (value <= 50) { rating = 'Moderate'; color = 'warning'; }
        else if (value <= 100) { rating = 'Poor'; color = 'danger'; }
        else if (value <= 150) { rating = 'Very Poor'; color = 'danger'; }
        else { rating = 'Hazardous'; color = 'danger'; }
    }
    
    element.innerHTML = `<span class="badge bg-${color}">${rating}</span>`;
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Fetches tide data from the API and updates the tides card display.
 * Handles errors gracefully and shows appropriate error messages if tide data is unavailable.
 *
 * @async
 */
async function fetchAndUpdateTides() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    
    try {
        const response = await fetch(`${basePath}/api/tides`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        updateTidesCard(data);
    } catch (error) {
        console.error('Error fetching tides data:', error);
        showTidesError();
    }
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the tides card with tide data including station information and tide times.
 * Displays high and low tide information in a responsive layout with future/past indicators.
 *
 * @param {Object} data - Tide data object containing station info and tide times.
 * @param {string} data.station_name - Name of the tide station.
 * @param {string} data.station_source - Source of the tide data.
 * @param {string} data.station_distance - Distance to the tide station.
 * @param {Array} data.tides - Array of tide objects with time and height information.
 */
function updateTidesCard(data) {
    const loadingElement = document.getElementById('tides-loading');
    const contentElement = document.getElementById('tides-content');
    const errorElement = document.getElementById('tides-error');
    
    // Hide loading and error, show content
    if (loadingElement) loadingElement.style.display = 'none';
    if (errorElement) errorElement.style.display = 'none';
    if (contentElement) contentElement.style.display = 'block';
    
    // Update station information
    const stationNameElement = document.getElementById('tide-station-name');
    const stationSourceElement = document.getElementById('tide-station-source');
    const stationDistanceElement = document.getElementById('tide-station-distance');
    
    if (stationNameElement) {
        const stationName = data.station_name || 'Unknown';
        // Capitalize first letter, lowercase the rest
        const formattedName = stationName.charAt(0).toUpperCase() + stationName.slice(1).toLowerCase();
        stationNameElement.textContent = formattedName;
    }
    if (stationSourceElement) {
        const stationSource = data.station_source || 'Unknown';
        // Convert to uppercase
        stationSourceElement.textContent = stationSource.toUpperCase();
    }
    if (stationDistanceElement) stationDistanceElement.textContent = data.station_distance || '0';
    
    // Update tides list
    const tidesListElement = document.getElementById('tides-list');
    if (tidesListElement) {
        tidesListElement.innerHTML = '';
        
        if (data.tides && data.tides.length > 0) {
            // Sort all tides by time
            const sortedTides = data.tides.sort((a, b) => new Date(a.time_full) - new Date(b.time_full));
            
            // Create a container for responsive layout
            const containerDiv = document.createElement('div');
            containerDiv.className = 'row';
            
            // Create left column for larger screens
            const leftColumn = document.createElement('div');
            leftColumn.className = 'col-md-6 d-none d-md-block';
            
            // Create right column for larger screens
            const rightColumn = document.createElement('div');
            rightColumn.className = 'col-md-6 d-none d-md-block';
            
            // Create mobile column for smaller screens
            const mobileColumn = document.createElement('div');
            mobileColumn.className = 'col-12 d-md-none';
            
            // Distribute tides chronologically across the two columns for larger screens
            sortedTides.forEach((tide, index) => {
                const tideElement = createTideElement(tide);
                
                // For larger screens: alternate between left and right columns
                if (index % 2 === 0) {
                    leftColumn.appendChild(tideElement);
                } else {
                    rightColumn.appendChild(tideElement);
                }
                
                // For mobile: add all tides to single column in chronological order
                const mobileTideElement = createTideElement(tide);
                mobileColumn.appendChild(mobileTideElement);
            });
            
            // Add columns to container
            containerDiv.appendChild(leftColumn);
            containerDiv.appendChild(rightColumn);
            containerDiv.appendChild(mobileColumn);
            
            // Add container to tides list
            tidesListElement.appendChild(containerDiv);
        } else {
            tidesListElement.innerHTML = '<p class="text-muted">No tide data available for today</p>';
        }
    }
    
    // Find the tides-content element and append the bottom section after it
    const tidesContentElement = document.getElementById('tides-content');
    if (tidesContentElement) {
        // Remove any existing bottom section container
        const existingBottomSection = tidesContentElement.querySelector('#tides-bottom-section');
        if (existingBottomSection) {
            existingBottomSection.remove();
        }
        
        // Create a dedicated container for the bottom section
        const bottomSection = document.createElement('div');
        bottomSection.id = 'tides-bottom-section';
        bottomSection.style.marginTop = '80px';
        tidesContentElement.appendChild(bottomSection);
        
        // Create a full-width column for the bottom section
        const bottomGridCol = document.createElement('div');
        bottomGridCol.className = 'col-12';
        bottomGridCol.style.paddingLeft = '0';
        bottomGridCol.style.paddingRight = '0';
        bottomSection.appendChild(bottomGridCol);
        
        // Add Last Updated timestamp above horizontal line
        const lastUpdatedDiv = document.createElement('div');
        lastUpdatedDiv.className = 'last-updated-text';
        lastUpdatedDiv.style.fontSize = '0.9rem';
        lastUpdatedDiv.style.color = '#666';
        lastUpdatedDiv.style.textAlign = 'center';
        lastUpdatedDiv.style.marginBottom = '10px';
        // Use the actual last updated time from the data if available, otherwise use current time
        let formatted;
        if (data.last_updated) {
            // Parse the date string "03-07-2025 00:30:21" format from cache file
            const dateParts = data.last_updated.split(' ')[0].split('-'); // ["03", "07", "2025"]
            const timeParts = data.last_updated.split(' ')[1].split(':'); // ["00", "30", "21"]
            console.log('Dam Levels last_updated split:', dateParts, timeParts);

            // Detect if the date is mm-dd-yyyy and swap if needed
            let day = dateParts[0], month = dateParts[1], year = dateParts[2];
            if (parseInt(dateParts[0]) <= 12 && parseInt(dateParts[1]) > 12) {
                // Looks like mm-dd-yyyy, swap
                [day, month] = [month, day];
            }
            const hour = parseInt(timeParts[0]);
            const minute = timeParts[1];
            
            // Convert to 12-hour format with AM/PM
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12; // 0 becomes 12 for 12 AM
            
            formatted = `Last Updated: ${day}/${month}/${year} ${displayHour.toString().padStart(2, '0')}:${minute} ${ampm}`;
        } else {
            // Fallback to current time if no last_updated
            const now = new Date();
            const options = {
                timeZone: 'Australia/Brisbane',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            };
            const localeString = now.toLocaleString('en-AU', options);
            const [datePart, timePart] = localeString.split(', ');
            formatted = `Last Updated: ${datePart} ${timePart.toUpperCase()}`;
        }
        lastUpdatedDiv.textContent = formatted;
        bottomGridCol.appendChild(lastUpdatedDiv);
        
        // Add horizontal line and attribution
        const bottomTextContainer = document.createElement('div');
        bottomTextContainer.style.borderTop = '1px solid #dee2e6';
        bottomTextContainer.style.paddingTop = '10px';
        bottomTextContainer.style.paddingBottom = '5px';
        bottomTextContainer.style.backgroundColor = '#f8f9fa';
        bottomTextContainer.style.width = '100%';
        bottomTextContainer.style.boxSizing = 'border-box';
        bottomTextContainer.style.marginLeft = '0';
        bottomTextContainer.style.marginRight = '0';
        bottomGridCol.appendChild(bottomTextContainer);
        
        // Attribution text
        const attributionDiv = document.createElement('div');
        attributionDiv.className = 'attribution-text';
        attributionDiv.style.fontSize = '0.9rem';
        attributionDiv.style.color = '#666';
        attributionDiv.style.textAlign = 'center';
        attributionDiv.textContent = 'Tide data provided by the Stormglass.io API';
        bottomTextContainer.appendChild(attributionDiv);
    }
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Creates a tide element for display in the tides list.
 * Generates HTML for individual tide entries with appropriate styling and future/past indicators.
 *
 * @param {Object} tide - Tide object containing time, height, type, and future status.
 * @param {string} tide.time_full - Full timestamp of the tide.
 * @param {number} tide.height - Height of the tide in meters.
 * @param {string} tide.type - Type of tide ('high' or 'low').
 * @param {boolean} tide.is_future - Whether the tide is in the future.
 * @returns {HTMLElement} DOM element representing the tide entry.
 */
function createTideElement(tide) {
    const tideDiv = document.createElement('div');
    tideDiv.className = 'd-flex justify-content-between align-items-center mb-3 p-3 border rounded w-100';
    
    // Add future indicator styling
    if (tide.is_future) {
        tideDiv.classList.add('border-primary', 'bg-light');
    } else {
        tideDiv.classList.add('border-secondary', 'bg-light', 'opacity-75');
    }
    
    const tideType = tide.type === 'high' ? 'High Tide' : 'Low Tide';
    const tideIcon = tide.type === 'high' ? '🌊' : '🌊';
    const tideColor = tide.type === 'high' ? 'text-primary' : 'text-info';
    
    // Parse the full time to get date and time
    const tideDateTime = new Date(tide.time_full);
    const tideDate = tideDateTime.toLocaleDateString('en-AU', { 
        weekday: 'short', 
        month: 'short', 
        day: 'numeric' 
    });
    const tideTime = tideDateTime.toLocaleTimeString('en-AU', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
    });
    
    tideDiv.innerHTML = `
        <div class="d-flex align-items-center flex-grow-1">
            <span class="me-3" style="font-size: 1.5rem;"></span>
            <div class="flex-grow-1">
                <div class="fw-bold ${tideColor} fs-6">${tideType}</div>
                <div class="text-muted small">${tideDate} at ${tideTime}</div>
            </div>
        </div>
        <div class="text-end ms-3">
            <div class="fw-bold fs-5">${tide.height.toFixed(1)}m</div>
            <div class="small">
                ${tide.is_future ? '<span class="text-primary">Upcoming</span>' : '<span class="text-muted">Past</span>'}
            </div>
        </div>
    `;
    
    return tideDiv;
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Shows the tides error state by hiding loading and content elements and displaying error message.
 * Handles error display when tide data cannot be fetched or processed.
 */
function showTidesError() {
    const loadingElement = document.getElementById('tides-loading');
    const contentElement = document.getElementById('tides-content');
    const errorElement = document.getElementById('tides-error');
    
    // Hide loading and content, show error
    if (loadingElement) loadingElement.style.display = 'none';
    if (contentElement) contentElement.style.display = 'none';
    if (errorElement) errorElement.style.display = 'block';
}

// Dam Levels functionality
async function fetchAndUpdateDamLevels() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    
    try {
        const response = await fetch(`${basePath}/api/dam-levels`);
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        updateDamLevelsCard(data);
    } catch (error) {
        console.error('Error fetching dam levels data:', error);
        showDamLevelsError();
    }
}

function updateDamLevelsCard(data) {
    console.log('updateDamLevelsCard called with data:', data);
    
    const loadingElement = document.getElementById('dam-levels-loading');
    const contentElement = document.getElementById('dam-levels-content');
    const errorElement = document.getElementById('dam-levels-error');
    
    // Hide loading and error, show content
    if (loadingElement) loadingElement.style.display = 'none';
    if (errorElement) errorElement.style.display = 'none';
    if (contentElement) contentElement.style.display = 'block';
    
    // Remove the old last updated timestamp element
    const updatedElement = document.getElementById('dam-levels-updated');
    if (updatedElement) {
        updatedElement.remove();
    }
    
    // Update dams list
    const damsListElement = document.getElementById('dam-levels-list');
    if (damsListElement) {
        damsListElement.innerHTML = '';
        
        if (data.dams && data.dams.length > 0) {
            data.dams.forEach(dam => {
                const damElement = createDamElement(dam);
                damsListElement.appendChild(damElement);
            });
        } else {
            damsListElement.innerHTML = '<p class="text-muted">No dam data available</p>';
        }
    }
    
    // Find the dam-levels-content element and append the bottom section after it
    const damLevelsContentElement = document.getElementById('dam-levels-content');
    if (damLevelsContentElement) {
        // Remove any existing bottom section container
        const existingBottomSection = damLevelsContentElement.querySelector('#dam-levels-bottom-section');
        if (existingBottomSection) {
            existingBottomSection.remove();
        }
        // Create a dedicated container for the bottom section
        const bottomSection = document.createElement('div');
        bottomSection.id = 'dam-levels-bottom-section';
        bottomSection.style.marginTop = '20px';
        damLevelsContentElement.appendChild(bottomSection);
        // Create a full-width column for the bottom section
        const bottomGridCol = document.createElement('div');
        bottomGridCol.className = 'col-12';
        bottomGridCol.style.paddingLeft = '0';
        bottomGridCol.style.paddingRight = '0';
        bottomSection.appendChild(bottomGridCol);
        
        // Add Last Updated timestamp above horizontal line
        const lastUpdatedDiv = document.createElement('div');
        lastUpdatedDiv.className = 'last-updated-text';
        lastUpdatedDiv.style.fontSize = '0.9rem';
        lastUpdatedDiv.style.color = '#666';
        lastUpdatedDiv.style.textAlign = 'center';
        lastUpdatedDiv.style.marginBottom = '10px';
        // Use the actual last updated time from the data if available, otherwise use current time
        let formatted;
        console.log('Dam Levels data.last_updated:', data.last_updated);
        if (data.last_updated) {
            // Parse the date string "03-07-2025 00:30:21" format from cache file
            const dateParts = data.last_updated.split(' ')[0].split('-'); // ["03", "07", "2025"]
            const timeParts = data.last_updated.split(' ')[1].split(':'); // ["00", "30", "21"]
            console.log('Dam Levels last_updated split:', dateParts, timeParts);

            // Detect if the date is mm-dd-yyyy and swap if needed
            let day = dateParts[0], month = dateParts[1], year = dateParts[2];
            if (parseInt(dateParts[0]) <= 12 && parseInt(dateParts[1]) > 12) {
                // Looks like mm-dd-yyyy, swap
                [day, month] = [month, day];
            }
            const hour = parseInt(timeParts[0]);
            const minute = timeParts[1];
            
            // Convert to 12-hour format with AM/PM
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12; // 0 becomes 12 for 12 AM
            
            formatted = `Last Updated: ${day}/${month}/${year} ${displayHour.toString().padStart(2, '0')}:${minute} ${ampm}`;
        } else {
            // Fallback to current time if no last_updated
            const now = new Date();
            const options = {
                timeZone: 'Australia/Brisbane',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            };
            const localeString = now.toLocaleString('en-AU', options);
            const [datePart, timePart] = localeString.split(', ');
            formatted = `Last Updated: ${datePart} ${timePart.toUpperCase()}`;
        }
        console.log('Dam Levels formatted timestamp:', formatted);
        lastUpdatedDiv.textContent = formatted;
        bottomGridCol.appendChild(lastUpdatedDiv);
        
        // Add horizontal line and attribution
        const bottomTextContainer = document.createElement('div');
        bottomTextContainer.style.borderTop = '1px solid #dee2e6';
        bottomTextContainer.style.paddingTop = '10px';
        bottomTextContainer.style.paddingBottom = '5px';
        bottomTextContainer.style.backgroundColor = '#f8f9fa';
        bottomTextContainer.style.width = '100%';
        bottomTextContainer.style.boxSizing = 'border-box';
        bottomTextContainer.style.marginLeft = '0';
        bottomTextContainer.style.marginRight = '0';
        bottomGridCol.appendChild(bottomTextContainer);
        
        // Attribution text
        const attributionDiv = document.createElement('div');
        attributionDiv.className = 'attribution-text';
        attributionDiv.style.fontSize = '0.9rem';
        attributionDiv.style.color = '#666';
        attributionDiv.style.textAlign = 'center';
        attributionDiv.textContent = 'Dam level data provided by SEQWater.com.au';
        bottomTextContainer.appendChild(attributionDiv);
    }
}

function createDamElement(dam) {
    const damDiv = document.createElement('div');
    damDiv.className = 'd-flex justify-content-between align-items-center mb-3 p-3 border rounded w-100';
    
    // Add styling based on dam level
    damDiv.style.borderColor = dam.color;
    damDiv.style.backgroundColor = dam.color + '10'; // Add slight tint
    
    // Format volume with commas for readability
    const formattedVolume = dam.volume_ml.toLocaleString();
    
    damDiv.innerHTML = `
        <div class="d-flex align-items-center flex-grow-1">
            <div class="flex-grow-1">
                <div class="fw-bold fs-6">${dam.name}</div>
                <div class="text-muted small">Volume: ${formattedVolume} ML</div>
            </div>
        </div>
        <div class="text-end ms-3">
            <div class="fw-bold fs-5" style="color: ${dam.color};">${dam.percent_full.toFixed(1)}%</div>
            <div class="small text-muted">of Capacity</div>
        </div>
    `;
    
    return damDiv;
}

function showDamLevelsError() {
    const loadingElement = document.getElementById('dam-levels-loading');
    const contentElement = document.getElementById('dam-levels-content');
    const errorElement = document.getElementById('dam-levels-error');
    
    // Hide loading and content, show error
    if (loadingElement) loadingElement.style.display = 'none';
    if (contentElement) contentElement.style.display = 'none';
    if (errorElement) errorElement.style.display = 'block';
}

async function fetchAndUpdateWeeklyStats() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    
    try {
        // Fetch trends data which includes both current and previous week data
        const trendsResponse = await fetch(`${basePath}/api/weekly_stats_trends`);
        const trendsData = await trendsResponse.json();
        
        if (trendsData.error) {
            // Fallback to individual endpoints if trends endpoint fails
            const currentResponse = await fetch(`${basePath}/api/weekly_stats_current`);
            const currentData = await currentResponse.json();
            updateWeeklyStatsCard('current', currentData);
            
            const previousResponse = await fetch(`${basePath}/api/weekly_stats_previous`);
            const previousData = await previousResponse.json();
            updateWeeklyStatsCard('previous', previousData);
        } else {
            // Use trends data with separate trend calculations for each week
            updateWeeklyStatsCard('current', trendsData.current_week, trendsData.trends_current);
            updateWeeklyStatsCard('previous', trendsData.previous_week, trendsData.trends_previous);
        }
        
    } catch (error) {
        console.error('Error fetching weekly stats:', error);
        showWeeklyStatsError('current');
        showWeeklyStatsError('previous');
    }
}

function updateWeeklyStatsCard(type, data, trends = null) {
    const loadingElement = document.getElementById(`weekly-stats-${type}-loading`);
    const contentElement = document.getElementById(`weekly-stats-${type}-content`);
    const errorElement = document.getElementById(`weekly-stats-${type}-error`);
    
    if (data.error) {
        loadingElement.style.display = 'none';
        contentElement.style.display = 'none';
        errorElement.style.display = 'block';
        return;
    }
    
    loadingElement.style.display = 'none';
    errorElement.style.display = 'none';
    contentElement.style.display = 'block';
    
    // Format the date range
    const weekStart = new Date(data.week_start);
    const weekEnd = new Date(data.week_end);
    const dateRange = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    
    // Helper function to get trend icon
    function getTrendIcon(metric, trends) {
        if (!trends || !trends[metric]) return '';
        
        const trend = trends[metric];
        let icon, color, text;
        
        switch (trend) {
            case 'up':
                icon = 'fa-arrow-up';
                color = '#28a745'; // Green for increase
                text = '(increasing)';
                break;
            case 'down':
                icon = 'fa-arrow-down';
                color = '#dc3545'; // Red for decrease
                text = '(decreasing)';
                break;
            case 'flat':
            default:
                icon = '';
                color = '#6c757d'; // Gray for no change
                text = '(stable)';
                break;
        }
        
        if (icon) {
            return `<i class="fas ${icon} trend-icon" style="color: ${color}; margin-left: 0.25rem; font-size: 0.75rem;"></i><span style="color: ${color}; margin-left: 0.25rem; font-size: 0.75rem;">${text}</span>`;
        } else {
            return `<span style="color: ${color}; margin-left: 0.25rem; font-size: 0.75rem;">${text}</span>`;
        }
    }
    
    // Helper function to get UV risk level
    function getUVRiskLevel(uvValue) {
        if (uvValue === null || uvValue === undefined) return '';
        if (uvValue <= 2) return '(Low)';
        else if (uvValue <= 5) return '(Moderate)';
        else if (uvValue <= 7) return '(High)';
        else if (uvValue <= 10) return '(Very High)';
        else return '(Extreme)';
    }
    
    // Helper function to get PM10 scale
    function getPM10Scale(pm10Value) {
        if (pm10Value === null || pm10Value === undefined) return '';
        if (pm10Value >= 0 && pm10Value <= 12) return '(Good)';
        else if (pm10Value > 12 && pm10Value <= 35.4) return '(Moderate)';
        else if (pm10Value > 35.4 && pm10Value <= 55.4) return '(Poor)';
        else if (pm10Value > 55.4 && pm10Value <= 150.4) return '(Unhealthy)';
        else if (pm10Value > 150.4 && pm10Value <= 250.4) return '(Severe)';
        else if (pm10Value > 250.4) return '(Hazardous)';
        else return '';
    }
    
    // Create the HTML content with improved layout and trend icons
    const html = `
        <div class="row mb-3">
            <div class="col-12">
                <h6 class="text-muted text-center border-bottom pb-2">${dateRange}</h6>
            </div>
        </div>
        <div class="row g-3">
            <div class="col-6">
                <div class="stat-group">
                    <h6 class="text-muted mb-2 text-center">Temperature (°C)</h6>
                    <div class="stat-row">
                        <div class="stat-item">
                            <span class="stat-label">Min:</span>
                            <span class="stat-value">${data.min_temp !== null ? data.min_temp + '°C' : '--'}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Max:</span>
                            <span class="stat-value">${data.max_temp !== null ? data.max_temp + '°C' : '--'}</span>
                        </div>
                    </div>
                    <div class="stat-row text-center">
                        <div class="stat-item single-value">
                            <span class="stat-value fw-bold">Avg: ${data.avg_temp !== null ? data.avg_temp + '°C' : '--'}${getTrendIcon('avg_temp', trends)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-6">
                <div class="stat-group">
                    <h6 class="text-muted mb-2 text-center">Humidity (%)</h6>
                    <div class="stat-row">
                        <div class="stat-item">
                            <span class="stat-label">Min:</span>
                            <span class="stat-value">${data.min_humidity !== null ? data.min_humidity + '%' : '--'}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Max:</span>
                            <span class="stat-value">${data.max_humidity !== null ? data.max_humidity + '%' : '--'}</span>
                        </div>
                    </div>
                    <div class="stat-row text-center">
                        <div class="stat-item single-value">
                            <span class="stat-value fw-bold">Avg: ${data.avg_humidity !== null ? data.avg_humidity + '%' : '--'}${getTrendIcon('avg_humidity', trends)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-6">
                <div class="stat-group">
                    <h6 class="text-muted mb-2 text-center">Pressure (hPa)</h6>
                    <div class="stat-row">
                        <div class="stat-item">
                            <span class="stat-label">Min:</span>
                            <span class="stat-value">${data.min_pressure !== null ? data.min_pressure : '--'}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Max:</span>
                            <span class="stat-value">${data.max_pressure !== null ? data.max_pressure : '--'}</span>
                        </div>
                    </div>
                    <div class="stat-row text-center">
                        <div class="stat-item single-value">
                            <span class="stat-value fw-bold">Avg: ${data.avg_pressure !== null ? data.avg_pressure : '--'}${getTrendIcon('avg_pressure', trends)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-6">
                <div class="stat-group">
                    <h6 class="text-muted mb-2 text-center">Wind (km/h)</h6>
                    <div class="stat-row">
                        <div class="stat-item">
                            <span class="stat-label">Gust:</span>
                            <span class="stat-value">${data.max_wind_gust !== null ? data.max_wind_gust + ' km/h from ' + (data.max_wind_gust_direction || '--') : '--'}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Avg:</span>
                            <span class="stat-value">${data.avg_wind_speed !== null ? data.avg_wind_speed + ' km/h' : '--'}${getTrendIcon('avg_wind_speed', trends)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-6">
                <div class="stat-group">
                    <h6 class="text-muted mb-2 text-center">Rainfall</h6>
                    <div class="stat-row text-center">
                        <div class="stat-item single-value">
                            <span class="stat-value fw-bold fs-5">${data.total_rainfall !== null ? data.total_rainfall + ' mm' : '--'}${getTrendIcon('total_rainfall', trends)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-6">
                <div class="stat-group">
                    <h6 class="text-muted mb-2 text-center">UV Index</h6>
                    <div class="stat-row">
                        <div class="stat-item">
                            <span class="stat-label">Max:</span>
                            <span class="stat-value">${data.max_uv !== null ? data.max_uv : '--'}${getUVRiskLevel(data.max_uv)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Avg:</span>
                            <span class="stat-value">${data.avg_uv !== null ? data.avg_uv : '--'}${getUVRiskLevel(data.avg_uv)}${getTrendIcon('avg_uv', trends)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-6">
                <div class="stat-group">
                    <h6 class="text-muted mb-2 text-center">Lightning</h6>
                    <div class="stat-row">
                        <div class="stat-item">
                            <span class="stat-label">Max:</span>
                            <span class="stat-value">${data.max_lightning_strikes !== null ? data.max_lightning_strikes : '--'}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Total:</span>
                            <span class="stat-value">${data.total_lightning_strikes !== null ? data.total_lightning_strikes : '--'}${getTrendIcon('total_lightning_strikes', trends)}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div class="col-6">
                <div class="stat-group">
                    <h6 class="text-muted mb-2 text-center">PM10 (μg/m³)</h6>
                    <div class="stat-row">
                        <div class="stat-item">
                            <span class="stat-label">Max:</span>
                            <span class="stat-value">${data.max_pm10 !== null ? data.max_pm10 : '--'}${getPM10Scale(data.max_pm10)}</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">Avg:</span>
                            <span class="stat-value">${data.avg_pm10 !== null ? data.avg_pm10 : '--'}${getPM10Scale(data.avg_pm10)}${getTrendIcon('avg_pm10', trends)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    contentElement.innerHTML = html;
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Shows the weekly stats error state by hiding loading and content elements and displaying error message.
 * Handles error display when weekly statistics data cannot be fetched or processed.
 *
 * @param {string} type - Type of weekly stats ('current' or 'previous') to show error for.
 */
function showWeeklyStatsError(type) {
    const loadingElement = document.getElementById(`weekly-stats-${type}-loading`);
    const contentElement = document.getElementById(`weekly-stats-${type}-content`);
    const errorElement = document.getElementById(`weekly-stats-${type}-error`);
    
    loadingElement.style.display = 'none';
    contentElement.style.display = 'none';
    errorElement.style.display = 'block';
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Initiates CSV download for weather data based on the specified time period.
 * Creates a temporary download link and triggers the file download with appropriate filename.
 *
 * @param {string} period - Time period for the CSV data ('24h', '72h', '7d', or '28d').
 */
function downloadCSV(period) {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    
    // Show loading indicator or disable button
    const downloadButton = document.querySelector(`[data-period="${period}"]`);
    const originalText = downloadButton.textContent;
    downloadButton.textContent = 'Downloading...';
    downloadButton.style.pointerEvents = 'none';
    
    // Create a temporary link element to trigger the download
    const link = document.createElement('a');
    link.href = `${basePath}/api/download_csv?period=${period}`;
    link.download = `weather_data_${period}_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    
    // Append to body, click, and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Reset button after a short delay
    setTimeout(() => {
        downloadButton.textContent = originalText;
        downloadButton.style.pointerEvents = 'auto';
    }, 2000);
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Fetches and updates the comfort levels data from the API.
 * Retrieves the latest dew point, heat index, wind chill, and calculated feels like temperature.
 */
async function fetchAndUpdateComfortLevels() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    try {
        const response = await fetch(`${basePath}/api/comfort_levels`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log(data);
        updateComfortLevelsCard(data);
    } catch (error) {
        console.error('Error fetching comfort levels:', error);
        showComfortLevelsError();
    }
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the comfort levels card with the latest data.
 * Displays dew point, heat index, wind chill, feels like temperature, and comfort rating with image.
 *
 * @param {Object} data - Comfort levels data object containing temperature values and comfort information.
 */
function updateComfortLevelsCard(data) {
    const loadingElement = document.getElementById('comfort-levels-loading');
    const contentElement = document.getElementById('comfort-levels-content');
    const errorElement = document.getElementById('comfort-levels-error');
    
    if (data.error) {
        loadingElement.style.display = 'none';
        contentElement.style.display = 'none';
        errorElement.style.display = 'block';
        return;
    }
    
    // Update the values
    document.getElementById('comfort-dew-point').textContent = 
        data.dew_point !== null ? `${data.dew_point}°C` : '--°C';
    document.getElementById('comfort-heat-index').textContent = 
        data.heat_index !== null ? `${data.heat_index}°C` : '--°C';
    document.getElementById('comfort-wind-chill').textContent = 
        data.wind_chill !== null ? `${data.wind_chill}°C` : '--°C';
    document.getElementById('comfort-feels-like').textContent = 
        data.feels_like !== null ? `${data.feels_like}°C` : '--°C';
    
    // Update comfort rating and image
    const ratingElement = document.getElementById('comfort-rating');
    const imageElement = document.getElementById('comfort-image');
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    
    if (data.comfort_rating && data.comfort_image) {
        ratingElement.textContent = data.comfort_rating;
        imageElement.src = `${basePath}/static/images/${data.comfort_image}`;
        imageElement.style.display = 'block';
    } else {
        ratingElement.textContent = '';
        imageElement.style.display = 'none';
    }
    
    // Show content and hide loading/error
    loadingElement.style.display = 'none';
    errorElement.style.display = 'none';
    contentElement.style.display = 'block';
    
    // Get the card body to append the bottom section
    const cardBody = contentElement.closest('.card-body') || contentElement.parentElement;
    
    // Remove any existing last-updated-text and attribution elements
    const existingLastUpdated = cardBody.querySelector('.last-updated-text');
    if (existingLastUpdated) {
        existingLastUpdated.remove();
    }
    
    const existingAttribution = cardBody.querySelector('.attribution-text');
    if (existingAttribution) {
        existingAttribution.parentElement.remove();
    }
    
    // Add Last Updated timestamp above horizontal line
    const lastUpdatedDiv = document.createElement('div');
    lastUpdatedDiv.className = 'last-updated-text';
    lastUpdatedDiv.style.fontSize = '0.9rem';
    lastUpdatedDiv.style.color = '#666';
    lastUpdatedDiv.style.textAlign = 'center';
    lastUpdatedDiv.style.marginBottom = '10px';
    lastUpdatedDiv.textContent = `Last Updated: ${new Date().toLocaleString('en-AU', { 
        day: '2-digit', 
        month: '2-digit', 
        year: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
    })}`;
    cardBody.appendChild(lastUpdatedDiv);
    
    // Add horizontal line and attribution
    const bottomTextContainer = document.createElement('div');
    bottomTextContainer.style.borderTop = '1px solid #dee2e6';
    bottomTextContainer.style.paddingTop = '10px';
    bottomTextContainer.style.paddingBottom = '5px';
    bottomTextContainer.style.backgroundColor = '#f8f9fa';
    bottomTextContainer.style.width = '100%';
    bottomTextContainer.style.boxSizing = 'border-box';
    cardBody.appendChild(bottomTextContainer);
    
    // Attribution text
    const attributionDiv = document.createElement('div');
    attributionDiv.className = 'attribution-text';
    attributionDiv.style.fontSize = '0.9rem';
    attributionDiv.style.color = '#666';
    attributionDiv.style.textAlign = 'center';
    attributionDiv.textContent = 'Comfort calculations based on data from the Ecowitt WS69 Personal Weather Station';
    bottomTextContainer.appendChild(attributionDiv);
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Shows the error state for the comfort levels card.
 * Displays an error message when comfort levels data cannot be loaded.
 */
function showComfortLevelsError() {
    const loadingElement = document.getElementById('comfort-levels-loading');
    const contentElement = document.getElementById('comfort-levels-content');
    const errorElement = document.getElementById('comfort-levels-error');
    
    loadingElement.style.display = 'none';
    contentElement.style.display = 'none';
    errorElement.style.display = 'block';
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Fetches and updates the capital cities weather data from the API.
 * Retrieves current weather and forecast data for all Australian capital cities.
 */
async function fetchAndUpdateCapitalCities() {
    const isProd = window.location.hostname !== 'localhost';
    const basePath = isProd ? '/njawa' : '';
    try {
        const response = await fetch(`${basePath}/api/capital_cities`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        updateCapitalCitiesCard(data);
    } catch (error) {
        console.error('Error fetching capital cities data:', error);
        showCapitalCitiesError();
    }
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Updates the capital cities card with weather data for all Australian capital cities.
 * Displays current conditions, hourly forecast, and daily min/max temperatures for each city.
 *
 * @param {Object} data - Capital cities data object containing weather information for each city.
 */
function updateCapitalCitiesCard(data) {
    const loadingElement = document.getElementById('capital-cities-loading');
    const contentElement = document.getElementById('capital-cities-content');
    const errorElement = document.getElementById('capital-cities-error');
    
    if (data.error) {
        loadingElement.style.display = 'none';
        contentElement.style.display = 'none';
        errorElement.style.display = 'block';
        return;
    }
    
    const citiesListElement = document.getElementById('capital-cities-list');
    
    // Generate HTML for each city
    let html = '';
    
    data.cities.forEach(city => {
        if (city.error) {
            // Show error for this city
            html += `
                <div class="row mb-2">
                    <div class="col-12">
                        <div class="d-flex justify-content-between align-items-center p-2 border rounded">
                            <div class="fw-bold">${city.name}</div>
                            <div class="text-danger small">Error loading data</div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Show weather data for this city
            const currentHour = city.current_hour;
            const dailyForecast = city.daily_forecast;
            
            if (currentHour && dailyForecast) {
                const currentTemp = currentHour.temp_c !== null ? `${currentHour.temp_c}°C` : '--';
                const maxTemp = dailyForecast.maxtemp_c !== null ? `${dailyForecast.maxtemp_c}°C` : '--';
                const minTemp = dailyForecast.mintemp_c !== null ? `${dailyForecast.mintemp_c}°C` : '--';
                const conditionText = currentHour.condition?.text || '--';
                const conditionIcon = currentHour.condition?.icon || '';
                
                html += `
                    <div class="row mb-2">
                        <div class="col-12">
                            <div class="d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center p-2 border rounded">
                                <div class="fw-bold mb-1 mb-sm-0" style="min-width: 80px; word-wrap: break-word; overflow-wrap: break-word;">${city.name}</div>
                                <div class="d-flex flex-column flex-sm-row align-items-start align-items-sm-center flex-grow-1">
                                    <div class="d-flex align-items-center mb-1 mb-sm-0 me-sm-3">
                                        <div class="me-2">
                                            <img src="${conditionIcon}" alt="${conditionText}" style="width: 20px; height: 20px;">
                                        </div>
                                        <div class="me-3" style="word-wrap: break-word; overflow-wrap: break-word;">
                                            <small>${conditionText}</small>
                                        </div>
                                        <div class="me-3">
                                            <span class="fw-bold">${currentTemp}</span>
                                        </div>
                                    </div>
                                    <div class="d-flex align-items-center">
                                        <div class="me-2">
                                            <small class="text-muted">Max:</small>
                                            <span class="fw-bold text-danger">${maxTemp}</span>
                                        </div>
                                        <div>
                                            <small class="text-muted">Min:</small>
                                            <span class="fw-bold text-primary">${minTemp}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                // Show incomplete data for this city
                html += `
                    <div class="row mb-2">
                        <div class="col-12">
                            <div class="d-flex justify-content-between align-items-center p-2 border rounded">
                                <div class="fw-bold">${city.name}</div>
                                <div class="text-warning small">Incomplete data</div>
                            </div>
                        </div>
                    </div>
                `;
            }
        }
    });
    
    citiesListElement.innerHTML = html;
    
    // Show content and hide loading/error
    loadingElement.style.display = 'none';
    errorElement.style.display = 'none';
    contentElement.style.display = 'block';
    
    // Get the card body to append the bottom section
    const cardBody = contentElement.closest('.card-body') || contentElement.parentElement;
    
    // Remove any existing last-updated-text and attribution elements
    const existingLastUpdated = cardBody.querySelector('.last-updated-text');
    if (existingLastUpdated) {
        existingLastUpdated.remove();
    }
    
    const existingAttribution = cardBody.querySelector('.attribution-text');
    if (existingAttribution) {
        existingAttribution.parentElement.remove();
    }
    
    // Add Last Updated timestamp above horizontal line
    const lastUpdatedDiv = document.createElement('div');
    lastUpdatedDiv.className = 'last-updated-text';
    lastUpdatedDiv.style.fontSize = '0.9rem';
    lastUpdatedDiv.style.color = '#666';
    lastUpdatedDiv.style.textAlign = 'center';
    lastUpdatedDiv.style.marginBottom = '10px';
    // Use the actual last updated time from the data if available, otherwise use current time
    let formatted;
    if (data.last_updated) {
        // Parse the date string "03-07-2025 13:40:47" format from cache file
        const dateParts = data.last_updated.split(' ')[0].split('-'); // ["03", "07", "2025"]
        const timeParts = data.last_updated.split(' ')[1].split(':'); // ["13", "40", "47"]
        
        // Detect if the date is mm-dd-yyyy and swap if needed
        let day = dateParts[0], month = dateParts[1], year = dateParts[2];
        if (parseInt(dateParts[0]) <= 12 && parseInt(dateParts[1]) > 12) {
            // Looks like mm-dd-yyyy, swap
            [day, month] = [month, day];
        }
        const hour = parseInt(timeParts[0]);
        const minute = timeParts[1];
        
        // Convert to 12-hour format with AM/PM
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const displayHour = hour % 12 || 12; // 0 becomes 12 for 12 AM
        
        formatted = `Last Updated: ${day}/${month}/${year} ${displayHour.toString().padStart(2, '0')}:${minute} ${ampm}`;
    } else {
        // Fallback to current time if no last_updated
        const now = new Date();
        const options = {
            timeZone: 'Australia/Brisbane',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        };
        const localeString = now.toLocaleString('en-AU', options);
        const [datePart, timePart] = localeString.split(', ');
        formatted = `Last Updated: ${datePart} ${timePart.toUpperCase()}`;
    }
    lastUpdatedDiv.textContent = formatted;
    cardBody.appendChild(lastUpdatedDiv);
    
    // Add horizontal line and attribution
    const bottomTextContainer = document.createElement('div');
    bottomTextContainer.style.borderTop = '1px solid #dee2e6';
    bottomTextContainer.style.paddingTop = '10px';
    bottomTextContainer.style.paddingBottom = '5px';
    bottomTextContainer.style.backgroundColor = '#f8f9fa';
    bottomTextContainer.style.width = '100%';
    bottomTextContainer.style.boxSizing = 'border-box';
    cardBody.appendChild(bottomTextContainer);
    
    // Attribution text
    const attributionDiv = document.createElement('div');
    attributionDiv.className = 'attribution-text';
    attributionDiv.style.fontSize = '0.9rem';
    attributionDiv.style.color = '#666';
    attributionDiv.style.textAlign = 'center';
    attributionDiv.textContent = 'Capital City Weather data provided by WeatherAPI.com';
    bottomTextContainer.appendChild(attributionDiv);
}

/**
 * Author: David Rogers
 * Email: dave@djrogers.net.au
 * Description: Shows the error state for the capital cities card.
 * Displays an error message when capital cities data cannot be loaded.
 */
function showCapitalCitiesError() {
    const loadingElement = document.getElementById('capital-cities-loading');
    const contentElement = document.getElementById('capital-cities-content');
    const errorElement = document.getElementById('capital-cities-error');
    
    loadingElement.style.display = 'none';
    contentElement.style.display = 'none';
    errorElement.style.display = 'block';
}
