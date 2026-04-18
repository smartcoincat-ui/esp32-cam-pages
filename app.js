// ===============================================
// CONFIGURATION
// ===============================================
const CONFIG = {
    baseURL: 'https://planter.103.74.92.75.nip.io',
    username: 'cam',
    password: 'CamAccess2026',
    pollInterval: 10000, // 10 seconds
    chartMaxPoints: 100
};

// ===============================================
// GLOBAL STATE
// ===============================================
let chart = null;
let chartData = {
    labels: [],
    moisture: [],
    soilTemp: [],
    airTemp: []
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
    document.getElementById('soilTemp').textContent = formatNumber(data.soil_temp_c);
    document.getElementById('airTemp').textContent = formatNumber(data.air_temp_c);
    document.getElementById('airHumidity').textContent = formatNumber(data.air_humidity_pct);
    document.getElementById('soilRaw').textContent = data.soil_raw || '—';
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
                    label: 'Температура почвы (°C)',
                    data: chartData.soilTemp,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    tension: 0.4,
                    fill: true,
                    yAxisID: 'y1'
                },
                {
                    label: 'Температура воздуха (°C)',
                    data: chartData.airTemp,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: false,
                    yAxisID: 'y1'
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
                }
            }
        }
    });
}

function updateChartWithHistory(historyData) {
    if (!historyData || !historyData.data || historyData.data.length === 0) {
        console.warn('No history data available');
        return;
    }
    
    // Clear existing data
    chartData.labels = [];
    chartData.moisture = [];
    chartData.soilTemp = [];
    chartData.airTemp = [];
    
    // Process history data (assuming it's an array of readings)
    const data = historyData.data;
    
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
            chartData.soilTemp.push(reading.soil_temp_c || null);
            chartData.airTemp.push(reading.air_temp_c || null);
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
    chartData.soilTemp.push(data.soil_temp_c || null);
    chartData.airTemp.push(data.air_temp_c || null);
    
    // Keep only last CONFIG.chartMaxPoints points
    if (chartData.labels.length > CONFIG.chartMaxPoints) {
        chartData.labels.shift();
        chartData.moisture.shift();
        chartData.soilTemp.shift();
        chartData.airTemp.shift();
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
    
    // Start polling
    setInterval(updateDashboard, CONFIG.pollInterval);
    
    // Refresh camera snapshot every 30 seconds
    setInterval(loadCameraSnapshot, 30000);
    
    console.log('✅ Dashboard initialized successfully!');
}

// ===============================================
// START APPLICATION
// ===============================================
document.addEventListener('DOMContentLoaded', init);
