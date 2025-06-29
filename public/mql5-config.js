// MQL5 Widget Configuration
window.MQL5_CONFIG = {
  // API Configuration
  api: {
    baseUrl: 'https://c.mql5.com',
    version: 'v1',
    timeout: 5000,
    retryAttempts: 3,
    retryDelay: 1000
  },
  
  // Rate Limiting
  rateLimiting: {
    requestsPerSecond: 10,
    requestsPerMinute: 600,
    requestsPerHour: 36000
  },
  
  // Widget Defaults
  defaults: {
    theme: 'light',
    locale: 'en',
    timezone: 'Etc/UTC',
    updateInterval: 1000, // 1 second
    errorRetryInterval: 5000 // 5 seconds
  },
  
  // Chart Configuration
  chart: {
    symbol: 'EURUSD',
    interval: 'D1',
    width: 340,
    height: 200,
    style: '1', // Candlestick
    toolbar_bg: '#f1f3f6',
    enable_publishing: false,
    hide_top_toolbar: false,
    hide_legend: false,
    save_image: false,
    studies: [
      'EMA@tv-basicstudies',
      'Volume@tv-basicstudies'
    ],
    studies_overrides: {
      'EMA.length': 20,
      'EMA.source': 'close',
      'EMA.style': 0,
      'EMA.linewidth': 2,
      'EMA.color': '#2196F3'
    }
  },
  
  // Ticker Configuration
  ticker: {
    symbols: [
      'EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD', 
      'USDCAD', 'USDCHF', 'NZDUSD'
    ],
    width: '100%',
    height: 50,
    showSymbol: true,
    showBidAsk: true,
    showChange: true,
    showVolume: true
  },
  
  // Currency Matrix Configuration
  matrix: {
    currencies: ['EUR', 'USD', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'NZD'],
    width: 700,
    height: 420,
    showPercentage: true,
    showTooltips: true,
    heatMapColors: {
      positive: '#4CAF50',
      negative: '#F44336',
      neutral: '#9E9E9E'
    }
  },
  
  // Error Handling
  errorHandling: {
    showErrors: true,
    logErrors: true,
    fallbackContent: true,
    retryOnError: true
  },
  
  // Local Storage Keys
  storage: {
    preferences: 'mql5_user_preferences',
    cache: 'mql5_widget_cache',
    errors: 'mql5_error_log'
  },
  
  // Authentication (if required)
  auth: {
    apiKey: process.env.MQL5_API_KEY || '',
    secretKey: process.env.MQL5_SECRET_KEY || ''
  }
}

// Utility functions for MQL5 widgets
window.MQL5_UTILS = {
  // Format currency values
  formatCurrency: (value, decimals = 4) => {
    return parseFloat(value).toFixed(decimals)
  },
  
  // Format percentage
  formatPercentage: (value, decimals = 2) => {
    return `${(value * 100).toFixed(decimals)}%`
  },
  
  // Get color based on value
  getValueColor: (value) => {
    if (value > 0) return '#4CAF50'
    if (value < 0) return '#F44336'
    return '#9E9E9E'
  },
  
  // Save user preferences
  savePreferences: (preferences) => {
    try {
      localStorage.setItem(
        window.MQL5_CONFIG.storage.preferences,
        JSON.stringify(preferences)
      )
    } catch (error) {
      console.error('Failed to save MQL5 preferences:', error)
    }
  },
  
  // Load user preferences
  loadPreferences: () => {
    try {
      const stored = localStorage.getItem(window.MQL5_CONFIG.storage.preferences)
      return stored ? JSON.parse(stored) : {}
    } catch (error) {
      console.error('Failed to load MQL5 preferences:', error)
      return {}
    }
  },
  
  // Log errors
  logError: (error, context = '') => {
    const errorLog = {
      timestamp: new Date().toISOString(),
      error: error.message || error,
      context,
      userAgent: navigator.userAgent,
      url: window.location.href
    }
    
    console.error('MQL5 Widget Error:', errorLog)
    
    try {
      const existingLogs = JSON.parse(
        localStorage.getItem(window.MQL5_CONFIG.storage.errors) || '[]'
      )
      existingLogs.push(errorLog)
      
      // Keep only last 50 errors
      const recentLogs = existingLogs.slice(-50)
      localStorage.setItem(
        window.MQL5_CONFIG.storage.errors,
        JSON.stringify(recentLogs)
      )
    } catch (storageError) {
      console.error('Failed to store error log:', storageError)
    }
  }
}

// Initialize MQL5 configuration on load
document.addEventListener('DOMContentLoaded', () => {
  console.log('MQL5 Configuration loaded')
  
  // Load user preferences
  const preferences = window.MQL5_UTILS.loadPreferences()
  if (preferences.theme) {
    window.MQL5_CONFIG.defaults.theme = preferences.theme
  }
  if (preferences.locale) {
    window.MQL5_CONFIG.defaults.locale = preferences.locale
  }
})