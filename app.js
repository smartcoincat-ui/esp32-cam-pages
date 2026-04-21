// ===============================================
// CONFIGURATION
// ===============================================
const CONFIG = {
    baseURL: 'https://planter.103.74.92.75.nip.io',
    username: 'cam',
    password: 'CamAccess2026',
    pollInterval: 10000,
    chartMaxPoints: 100,
    weatherLat: 55.9657,
    weatherLon: 37.7658
};

// ===============================================
// GLOBAL STATE
// ===============================================
let chart = null;
let chartData = {
    labels: [],
    moisture: [],
    airTemp: [],
    pumpOn: []
};
let lastUpdateTime = null;
let isOnline = false;

// ===============================================
// AUTHENTICATION
// ===============================================
function getAuthHeader() {
    const credentials = btoa(`${CONFIG.username}:${CONFIG.password}`);
    return `Basic ${credentials}`;
}

// ===============================================
// API FUNCTIONS
// ===============================================
async function fetchLatestData() {
    try {
        const response = await fetch(`${CONFIG.baseURL}/api/latest`, {
            method: 'GET',
            headers: {
                'Authorization': getAuthHeader(),
                'Accept': 'application/json'
            }
        });

        updateDiagnostics('diagApiCode', response.status);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (data.ok && data.pots && data.pots.length > 0) {
            return data.pots[0]; // First pot
        } else {
            throw new Error('Invalid data format');
        }
    } catch (error) {
        console.error('Error fetching latest data:', error);
        updateConnectionStatus(false);
        throw error;
    }
}

async function fetchHistoryData(hours = 24) {
    try {
        const response = await fetch(`${CONFIG.baseURL}/api/history?hours=${hours}`, {
            method: 'GET',
            headers: {
                'Authorization': getAuthHeader(),
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Error fetching history data:', error);
        return null;
    }
}

async function sendCommand(action, extra = {}) {
    const response = await fetch(`${CONFIG.baseURL}/api/command?api_key=change_me`, {
        method: 'POST',
        headers: {
            'Authorization': getAuthHeader(),
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ device: 'planter-esp8266-pot1', action, ...extra })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
}

async function fetchWeather() {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${CONFIG.weatherLat}&longitude=${CONFIG.weatherLon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const c = data.current || {};
        const el = document.getElementById('weatherNow');
        if (el) {
            el.textContent = `Сейчас: ${c.temperature_2m ?? '—'}°C, влажность ${c.relative_humidity_2m ?? '—'}%, ветер ${c.wind_speed_10m ?? '—'} м/с, осадки ${c.precipitation ?? '—'} мм`;
        }
    } catch (e) {
        const el = document.getElementById('weatherNow');
        if (el) el.textContent = 'Погода временно недоступна';
    }
}

function loadCameraSnapshot() {
    const img = document.getElementById('cameraSnapshot');
    const overlay = document.getElementById('snapshotOverlay');
    
    overlay.classList.remove('hidden');
    overlay.innerHTML = '<p>Загрузка...</p>';
    
    const timestamp = new Date().getTime();
    const snapshotURL = `${CONFIG.baseURL}/cam/capture?t=${timestamp}`;
    
    // Create a temporary image to test loading
    const tempImg = new Image();
    
    tempImg.onload = () => {
        img.src = snapshotURL;
        overlay.classList.add('hidden');
    };
    
    tempImg.onerror = () => {
        overlay.innerHTML = '<p>❌ Не удалось загрузить снимок</p>';
    };
    
    // Set auth header for image (Note: Basic auth in img src is limited)
    // For better security, consider proxying through your backend
    tempImg.src = snapshotURL;
}

// ===============================================
// UI UPDATE FUNCTIONS
// ===============================================
function updateConnectionStatus(online) {
    isOnline = online;
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    if (online) {
        statusDot.classList.add('online');
        statusDot.classList.remove('offline');
        statusText.textContent = 'Онлайн';
    } else {
        statusDot.classList.remove('online');
        statusDot.classList.add('offline');
        statusText.textContent = 'Оффлайн';
    }
}

function updateLastUpdateTime(timestamp) {
    lastUpdateTime = timestamp;
    const lastUpdateEl = document.getElementById('lastUpdate');
    
    if (timestamp) {
        const date = new Date(timestamp);
        const timeString = date.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const dateString = date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        lastUpdateEl.textContent = `${dateString} ${timeString}`;
    } else {
        lastUpdateEl.textContent = '—';
    }
}

function formatNumber(value, decimals = 1) {
    if (value === null || value === undefined || isNaN(value)) {
        return '—';
    }
    return Number(value).toFixed(decimals);
}

function updateKPICards(data) {
    document.getElementById('moisturePct').textContent = formatNumber(data.moisture_pct);
    document.getElementById('airTemp').textContent = formatNumber(data.air_temp_c);
    document.getElementById('airHumidity').textContent = formatNumber(data.air_humidity_pct);
    document.getElementById('soilRaw').textContent = (data.soil_raw ?? '—');

    const modeRaw = data.mode || 'AUTO';
    const mode = modeRaw === 'MANUAL' ? 'Ручной' : 'Авто';
    const pumpOn = !!data.pump_on;
    const trigRaw = data.trigger_reason || '—';
    const trigMap = {
      heartbeat: 'Периодический отчёт',
      manual_start: 'Ручной запуск',
      manual_stop: 'Ручная остановка',
      manual_timeout_stop: 'Ручной стоп по таймеру',
      auto_start_low_moisture: 'Автозапуск: низкая влажность',
      auto_stop_target_reached: 'Автостоп: цель достигнута',
      auto_stop_safety_timeout: 'Автостоп: лимит времени',
      auto_mode_enabled: 'Включён авто режим',
      manual_mode_enabled: 'Включён ручной режим'
    };
    const trig = trigMap[trigRaw] || trigRaw;

    const status = document.getElementById('pumpStatusText');
    if (status) status.textContent = `Насос: ${pumpOn ? 'ВКЛЮЧЕН' : 'ВЫКЛЮЧЕН'} | Режим: ${mode} | Событие: ${trig}`;

    const bA = document.getElementById('btnModeAuto');
    const bM = document.getElementById('btnModeManual');
    if (bA && bM) {
      bA.style.outline = modeRaw === 'AUTO' ? '3px solid #00c853' : 'none';
      bM.style.outline = modeRaw === 'MANUAL' ? '3px solid #ff9800' : 'none';
    }

    const m = Number(data.moisture_pct || 0);
    const bar = document.getElementById('moistureBar');
    const txt = document.getElementById('moistureLevelText');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, m))}%`;
    if (txt) txt.textContent = m < 25 ? 'Критично сухо' : m < 38 ? 'Суховато' : m <= 80 ? 'Норма' : 'Переувлажнение';
}

function updateRecommendations(moisturePct) {
    const recommendationsEl = document.getElementById('recommendations');
    const iconEl = document.getElementById('recommendationIcon');
    const textEl = document.getElementById('recommendationText');
    
    // Remove all status classes
    recommendationsEl.classList.remove('critical', 'warning', 'success', 'info');
    
    if (moisturePct < 25) {
        recommendationsEl.classList.add('critical');
        iconEl.textContent = '🚨';
        textEl.textContent = 'Критично сухо, нужен срочный полив!';
    } else if (moisturePct >= 25 && moisturePct <= 38) {
        recommendationsEl.classList.add('warning');
        iconEl.textContent = '⚠️';
        textEl.textContent = 'Суховато, полив в ближайшее время рекомендуется.';
    } else if (moisturePct >= 39 && moisturePct <= 80) {
        recommendationsEl.classList.add('success');
        iconEl.textContent = '✅';
        textEl.textContent = 'Всё в норме, растение получает достаточно влаги.';
    } else if (moisturePct > 80) {
        recommendationsEl.classList.add('info');
        iconEl.textContent = '💧';
        textEl.textContent = 'Переувлажнение, возможно избыточный полив. Дайте почве подсохнуть.';
    } else {
        recommendationsEl.classList.add('info');
        iconEl.textContent = 'ℹ️';
        textEl.textContent = 'Ожидание данных...';
    }
}

function updateDiagnostics(field, value) {
    const el = document.getElementById(field);
    if (el) {
        el.textContent = value || '—';
    }
}

function calculateSignalQuality(data) {
    // Simple quality assessment based on data freshness
    if (!data.ts) return 'Неизвестно';
    
    const dataTime = new Date(data.ts);
    const now = new Date();
    const diffMinutes = (now - dataTime) / 1000 / 60;
    
    if (diffMinutes < 1) return 'Отлично';
    if (diffMinutes < 5) return 'Хорошо';
    if (diffMinutes < 15) return 'Удовлетворительно';
    return 'Слабо';
}

// ===============================================
// CHART FUNCTIONS
// ===============================================
function initChart() {
    const ctx = document.getElementById('historyChart').getContext('2d');
    
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [
                {
                    label: 'Влажность почвы (%)',
                    data: chartData.moisture,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Температура воздуха (°C)',
                    data: chartData.airTemp,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: false,
                    yAxisID: 'y1'
                },
                {
                    label: 'Насос (1=ON)',
                    data: chartData.pumpOn,
                    borderColor: '#ef4444',
                    backgroundColor: 'rgba(239, 68, 68, 0.08)',
                    tension: 0.2,
                    fill: false,
                    yAxisID: 'y2'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: {
                            size: 12,
                            family: 'Inter'
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    padding: 12,
                    titleFont: {
                        size: 13,
                        family: 'Inter'
                    },
                    bodyFont: {
                        size: 12,
                        family: 'Inter'
                    },
                    cornerRadius: 8
                }
            },
            scales: {
                x: {
                    display: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45,
                        font: {
                            size: 11,
                            family: 'Inter'
                        }
                    }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Влажность (%)',
                        font: {
                            size: 12,
                            family: 'Inter'
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)'
                    },
                    ticks: {
                        font: {
                            size: 11,
                            family: 'Inter'
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Температура (°C)',
                        font: {
                            size: 12,
                            family: 'Inter'
                        }
                    },
                    grid: {
                        drawOnChartArea: false
                    },
                    ticks: {
                        font: {
                            size: 11,
                            family: 'Inter'
                        }
                    }
                },
                y2: {
                    type: 'linear',
                    display: false,
                    min: 0,
                    max: 1
                }
            }
        }
    });
}

function updateChartWithHistory(historyData) {
    const data = (historyData && (historyData.data || historyData.points || historyData.items)) || [];
    if (!Array.isArray(data) || data.length === 0) {
        console.warn('No history data available');
        return;
    }

    // Clear existing data
    chartData.labels = [];
    chartData.moisture = [];
    chartData.airTemp = [];
    chartData.pumpOn = [];
    
    // Process history data
    
    // Limit to last CONFIG.chartMaxPoints points
    const startIndex = Math.max(0, data.length - CONFIG.chartMaxPoints);
    
    for (let i = startIndex; i < data.length; i++) {
        const reading = data[i];
        
        if (reading.ts) {
            const date = new Date(reading.ts);
            const timeLabel = date.toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            chartData.labels.push(timeLabel);
            chartData.moisture.push(reading.moisture_pct || null);
            chartData.airTemp.push(reading.air_temp_c || null);
            chartData.pumpOn.push(reading.pump_on ? 1 : 0);
        }
    }
    
    // Update chart
    if (chart) {
        chart.update('none'); // Update without animation for smoother experience
    }
}

function addDataPointToChart(data) {
    if (!data.ts) return;
    
    const date = new Date(data.ts);
    const timeLabel = date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    // Add new data point
    chartData.labels.push(timeLabel);
    chartData.moisture.push(data.moisture_pct || null);
    chartData.airTemp.push(data.air_temp_c || null);
    chartData.pumpOn.push(data.pump_on ? 1 : 0);
    
    // Keep only last CONFIG.chartMaxPoints points
    if (chartData.labels.length > CONFIG.chartMaxPoints) {
        chartData.labels.shift();
        chartData.moisture.shift();
        chartData.airTemp.shift();
        chartData.pumpOn.shift();
    }
    
    // Update chart
    if (chart) {
        chart.update('none');
    }
}

// ===============================================
// MAIN UPDATE FUNCTION
// ===============================================
async function updateDashboard() {
    try {
        const data = await fetchLatestData();
        
        if (data) {
            // Update connection status
            updateConnectionStatus(true);
            
            // Update timestamp
            updateLastUpdateTime(data.ts);
            
            // Update KPI cards
            updateKPICards(data);
            
            // Update recommendations
            updateRecommendations(data.moisture_pct);
            
            // Update diagnostics
            updateDiagnostics('diagDevice', data.device);
            updateDiagnostics('diagPotId', data.pot_id);
            updateDiagnostics('diagQuality', calculateSignalQuality(data));
            
            // Add data point to chart
            addDataPointToChart(data);
        }
    } catch (error) {
        console.error('Dashboard update failed:', error);
        updateConnectionStatus(false);
    }
}

async function loadHistoryAndInitChart() {
    try {
        const historyData = await fetchHistoryData(24);
        
        if (historyData) {
            updateChartWithHistory(historyData);
        }
    } catch (error) {
        console.error('Failed to load history:', error);
    }
}

// ===============================================
// EVENT HANDLERS
// ===============================================
function setupEventHandlers() {
    // Refresh snapshot button
    document.getElementById('refreshSnapshot').addEventListener('click', () => {
        loadCameraSnapshot();
    });

    // Open stream button
    document.getElementById('openStream').addEventListener('click', () => {
        const streamURL = `${CONFIG.baseURL}/cam/stream`;
        window.open(streamURL, '_blank');
    });

    const modeAuto = document.getElementById('btnModeAuto');
    const modeManual = document.getElementById('btnModeManual');
    const pStart = document.getElementById('btnPumpStart');
    const pStop = document.getElementById('btnPumpStop');

    if (modeAuto) modeAuto.addEventListener('click', async () => { try { await sendCommand('set_mode', { mode: 'AUTO' }); await updateDashboard(); } catch(e){ console.error(e);} });
    if (modeManual) modeManual.addEventListener('click', async () => { try { await sendCommand('set_mode', { mode: 'MANUAL' }); await updateDashboard(); } catch(e){ console.error(e);} });
    if (pStart) pStart.addEventListener('click', async () => { try { await sendCommand('pump_start', { duration_s: 8 }); await updateDashboard(); } catch(e){ console.error(e);} });
    if (pStop) pStop.addEventListener('click', async () => { try { await sendCommand('pump_stop'); await updateDashboard(); } catch(e){ console.error(e);} });
}

// ===============================================
// INITIALIZATION
// ===============================================
async function init() {
    console.log('🌱 Smart Planter Dashboard initializing...');
    
    // Setup event handlers
    setupEventHandlers();
    
    // Initialize chart
    initChart();
    
    // Load initial data
    await updateDashboard();
    await loadHistoryAndInitChart();
    
    // Load camera snapshot
    loadCameraSnapshot();
    await fetchWeather();
    
    // Start polling
    setInterval(updateDashboard, CONFIG.pollInterval);
    setInterval(fetchWeather, 600000);
    
    // Refresh camera snapshot every 30 seconds
    setInterval(loadCameraSnapshot, 30000);
    
    console.log('✅ Dashboard initialized successfully!');
}

// ===============================================
// START APPLICATION
// ===============================================
document.addEventListener('DOMContentLoaded', init);
