// Константы и конфигурация
const CONFIG = {
  WEEKDAY_THRESHOLD_MULTIPLIER: 1.5,
  CHART_LOAD_DELAY: 300,
  INITIAL_LOAD_DELAY: 500,
  CHART_ANIMATION_DURATION: 500,
  CHART_ANIMATION_EASING: 'easeOutQuart',
  CHART_POINT_RADIUS: 5,
  CHART_BORDER_WIDTH: 2,
  LOCALE: 'ru-RU',
  COLORS: {
    CHART_LINE: '#0e9f6e',
    GRID: 'rgba(0, 0, 0, 0.05)'
  }
};

const ERROR_TYPES = {
  CHART_CREATION: 'CHART_CREATION_ERROR',
  DATA_VALIDATION: 'DATA_VALIDATION_ERROR',
  DOM_NOT_FOUND: 'DOM_NOT_FOUND_ERROR'
};

// Данные для таблицы
const metricsData = [
  {
    name: "Выручка, руб",
    current: 500521,
    yesterday: 480521,
    change: 4,
    weekday: 4805121,
    history: [0, 180000, 300000, 350000, 420000, 380000, 350000, 420000],
  },
  {
    name: "Наличные",
    current: 300000,
    yesterday: 300000,
    change: 0,
    weekday: 300000,
    history: [100000, 150000, 200000, 250000, 300000, 300000, 300000, 300000],
  },
  {
    name: "Безналичный расчет",
    current: 100000,
    yesterday: 100000,
    change: 0,
    weekday: 100000,
    history: [50000, 70000, 80000, 90000, 100000, 100000, 100000, 100000],
  },
  {
    name: "Кредитные карты",
    current: 100521,
    yesterday: 100521,
    change: 0,
    weekday: 100521,
    history: [30000, 50000, 70000, 80000, 90000, 95000, 100000, 100521],
  },
  {
    name: "Средний чек, руб",
    current: 1300,
    yesterday: 900,
    change: 44,
    weekday: 900,
    history: [700, 800, 850, 900, 950, 1000, 1100, 1300],
  },
  {
    name: "Средний гость, руб",
    current: 1200,
    yesterday: 800,
    change: 50,
    weekday: 800,
    history: [600, 700, 750, 800, 850, 900, 1000, 1200],
  },
  {
    name: "Удаления из чека (после оплаты), руб",
    current: 1000,
    yesterday: 1100,
    change: -9,
    weekday: 900,
    history: [1200, 1150, 1100, 1050, 1000, 950, 1000, 1000],
  },
  {
    name: "Удаления из чека (до оплаты), руб",
    current: 1300,
    yesterday: 1300,
    change: 0,
    weekday: 900,
    history: [900, 950, 1000, 1100, 1200, 1300, 1300, 1300],
  },
  {
    name: "Количество чеков",
    current: 34,
    yesterday: 36,
    change: -6,
    weekday: 34,
    history: [20, 25, 28, 30, 32, 34, 36, 34],
  },
  {
    name: "Количество гостей",
    current: 34,
    yesterday: 36,
    change: -6,
    weekday: 32,
    history: [18, 22, 25, 28, 30, 32, 36, 34],
  }
];

// Утилиты
function logError(type, error, context = {}) {
  console.error(`[Dashboard Error - ${type}]:`, error, context);
  
  if (typeof window !== 'undefined' && window.analytics) {
    window.analytics.track('Dashboard Error', {
      type,
      error: error.toString(),
      context
    });
  }
}

function validateMetric(metric) {
  const requiredFields = ['name', 'current', 'yesterday', 'change', 'weekday', 'history'];
  
  for (const field of requiredFields) {
    if (!(field in metric)) {
      logError(ERROR_TYPES.DATA_VALIDATION, `Missing field: ${field}`, { metric });
      return false;
    }
  }
  
  if (!Array.isArray(metric.history) || metric.history.length === 0) {
    logError(ERROR_TYPES.DATA_VALIDATION, 'Invalid history data', { metric });
    return false;
  }
  
  return true;
}

function safeQuerySelector(selector) {
  try {
    return document.querySelector(selector);
  } catch (error) {
    logError(ERROR_TYPES.DOM_NOT_FOUND, error, { selector });
    return null;
  }
}

// Vue приложение
const app = Vue.createApp({
  data() {
    return {
      metricsData: metricsData.filter(validateMetric),
      selectedMetricIndex: 0,
      chartLabels: [
        "День 1",
        "День 2", 
        "День 3",
        "День 4",
        "День 5",
        "День 6",
        "День 7",
        "Сегодня",
      ],
      loading: false,
      error: null,
      chartInstance: null,
    };
  },
  computed: {
    hasSelectedMetric() {
      return this.selectedMetricIndex >= 0 && this.selectedMetricIndex < this.metricsData.length;
    },
    selectedMetric() {
      return this.hasSelectedMetric ? this.metricsData[this.selectedMetricIndex] : null;
    }
  },
  
  methods: {
    formatNumber(num) {
      try {
        if (typeof num !== 'number' || isNaN(num)) {
          return '0';
        }
        return new Intl.NumberFormat(CONFIG.LOCALE).format(num);
      } catch (error) {
        logError(ERROR_TYPES.DATA_VALIDATION, error, { num });
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      }
    },

    getChangeClass(change) {
      if (change > 0) return "positive-change";
      if (change < 0) return "negative-change";
      return "";
    },

    getWeekdayClass(weekdayValue, currentValue) {
      if (weekdayValue > currentValue * CONFIG.WEEKDAY_THRESHOLD_MULTIPLIER) {
        return "weekday-high";
      }
      return "";
    },
    
    destroyChart() {
      if (this.chartInstance) {
        try {
          this.chartInstance.destroy();
          this.chartInstance = null;
        } catch (error) {
          logError(ERROR_TYPES.CHART_CREATION, error, { action: 'destroy' });
        }
      }
    },
    
    async selectMetric(index) {
      try {
        if (index < 0 || index >= this.metricsData.length) {
          throw new Error(`Invalid metric index: ${index}`);
        }

        if (this.selectedMetricIndex === index) {
          this.selectedMetricIndex = -1;
          this.destroyChart();
          return;
        }

        this.error = null;
        this.loading = true;
        this.selectedMetricIndex = index;
        this.destroyChart();

        await new Promise(resolve => setTimeout(resolve, CONFIG.CHART_LOAD_DELAY));
        await this.updateChart();
        
      } catch (error) {
        this.error = 'Ошибка при загрузке графика';
        logError(ERROR_TYPES.CHART_CREATION, error, { index });
      } finally {
        this.loading = false;
      }
    },
    
    createChartConfig(metric) {
      return {
        type: "line",
        data: {
          labels: this.chartLabels,
          datasets: [{
            label: metric.name,
            data: metric.history,
            fill: false,
            borderColor: CONFIG.COLORS.CHART_LINE,
            tension: 0.1,
            pointRadius: CONFIG.CHART_POINT_RADIUS,
            pointBackgroundColor: CONFIG.COLORS.CHART_LINE,
            borderWidth: CONFIG.CHART_BORDER_WIDTH,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {
            intersect: false,
            mode: 'index',
          },
          scales: {
            y: {
              beginAtZero: true,
              grid: {
                color: CONFIG.COLORS.GRID,
              },
              ticks: {
                callback: function (value) {
                  if (value >= 1000000) return (value / 1000000).toFixed(1) + "M";
                  if (value >= 1000) return (value / 1000).toFixed(0) + "K";
                  return value;
                },
              },
            },
            x: {
              grid: {
                display: false,
              },
            },
          },
          plugins: {
            tooltip: {
              callbacks: {
                label: function (context) {
                  let label = context.dataset.label || "";
                  if (label) {
                    label += ": ";
                  }
                  const value = context.parsed.y;
                  return label + new Intl.NumberFormat(CONFIG.LOCALE).format(value);
                },
              },
            },
            legend: {
              display: false,
            },
          },
          animation: {
            duration: CONFIG.CHART_ANIMATION_DURATION,
            easing: CONFIG.CHART_ANIMATION_EASING,
          },
        },
      };
    },
    
    async updateChart() {
      return new Promise((resolve, reject) => {
        try {
          if (!this.hasSelectedMetric) {
            resolve();
            return;
          }

          const metric = this.selectedMetric;
          
          if (!validateMetric(metric)) {
            throw new Error('Invalid metric data');
          }

          this.$nextTick(() => {
            try {
              const canvasId = `metricsChart-${this.selectedMetricIndex}`;
              const canvas = safeQuerySelector(`#${canvasId}`);

              if (!canvas) {
                throw new Error(`Canvas element not found: ${canvasId}`);
              }

              const ctx = canvas.getContext("2d");
              if (!ctx) {
                throw new Error('Failed to get canvas context');
              }

              const chartConfig = this.createChartConfig(metric);
              
              if (typeof Chart === 'undefined') {
                console.warn('Chart.js not available, skipping chart creation');
                resolve();
                return;
              }
              
              this.chartInstance = new Chart(ctx, chartConfig);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
          
        } catch (error) {
          reject(error);
        }
      });
    },
  },
  
  async mounted() {
    try {
      if (this.metricsData.length === 0) {
        throw new Error('No valid metrics data available');
      }

      this.loading = true;
      await new Promise(resolve => setTimeout(resolve, CONFIG.INITIAL_LOAD_DELAY));
      await this.updateChart();
      
    } catch (error) {
      this.error = 'Ошибка при инициализации приложения';
      logError(ERROR_TYPES.CHART_CREATION, error, { phase: 'mounted' });
    } finally {
      this.loading = false;
    }
  },
  
  beforeUnmount() {
    this.destroyChart();
  }
});

// Инициализация приложения
function initializeApp() {
  try {
    const appElement = safeQuerySelector("#app");
    
    if (!appElement) {
      throw new Error('App mount point not found');
    }
    
    if (typeof Vue === 'undefined') {
      throw new Error('Vue.js library not loaded');
    }
    
    if (typeof Chart === 'undefined') {
      console.warn('Chart.js library not loaded, charts will not work');
    }
    
    app.mount("#app");
        
  } catch (error) {
    logError(ERROR_TYPES.CHART_CREATION, error, { phase: 'initialization' });
    
    const appElement = safeQuerySelector("#app");
    if (appElement) {
      appElement.innerHTML = `
        <div style="padding: 20px; text-align: center; color: #ef4444;">
          <h2>Ошибка загрузки приложения</h2>
          <p>Пожалуйста, обновите страницу или обратитесь к администратору</p>
          <button onclick="location.reload()" style="margin-top: 10px; padding: 10px 20px;">
            Обновить страницу
          </button>
        </div>
      `;
    }
  }
}

initializeApp();
