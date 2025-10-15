import { Logger } from '../utils/logger.js'
import { MetricsCollector } from './metrics.js'

class MonitoringDashboard {
  constructor() {
    this.logger = new Logger()
    this.metricsCollector = new MetricsCollector()
    this.dashboardData = {
      system: {},
      trading: {},
      performance: {},
      alerts: [],
      charts: {}
    }
    
    this.updateInterval = null
    this.isRunning = false
  }

  start(intervalMs = 5000) {
    if (this.isRunning) {
      this.logger.warn('Monitoring dashboard is already running')
      return
    }

    this.logger.info('Starting monitoring dashboard')
    this.isRunning = true

    // Initial data collection
    this.collectData()

    // Set up update interval
    this.updateInterval = setInterval(() => {
      try {
        this.collectData()
        this.generateCharts()
        this.checkAlerts()
      } catch (error) {
        this.logger.error('Error in monitoring dashboard', { error: error.message })
      }
    }, intervalMs)
  }

  stop() {
    if (!this.isRunning) {
      this.logger.warn('Monitoring dashboard is not running')
      return
    }

    this.logger.info('Stopping monitoring dashboard')
    this.isRunning = false

    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
  }

  collectData() {
    // System metrics
    this.dashboardData.system = {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: this.getCpuUsage(),
      platform: process.platform,
      nodeVersion: process.version,
      timestamp: new Date().toISOString()
    }

    // Trading metrics
    this.dashboardData.trading = {
      totalTrades: this.metricsCollector.getMetricValue('trades_total'),
      winningTrades: this.metricsCollector.getMetricValue('trades_winning'),
      losingTrades: this.metricsCollector.getMetricValue('trades_losing'),
      totalPnL: this.metricsCollector.getMetricValue('pnl_total'),
      dailyPnL: this.metricsCollector.getMetricValue('pnl_daily'),
      openPositions: this.metricsCollector.getMetricValue('positions_open'),
      pendingOrders: this.metricsCollector.getMetricValue('orders_pending'),
      winRate: this.calculateWinRate(),
      sharpeRatio: this.calculateSharpeRatio(),
      maxDrawdown: this.calculateMaxDrawdown(),
      timestamp: new Date().toISOString()
    }

    // Performance metrics
    this.dashboardData.performance = {
      executionTime: this.metricsCollector.getMetricValue('execution_time'),
      latency: this.metricsCollector.getMetricValue('latency'),
      throughput: this.metricsCollector.getMetricValue('throughput'),
      errorRate: this.metricsCollector.getMetricValue('error_rate'),
      cacheHitRate: this.metricsCollector.getMetricValue('cache_hit_rate'),
      modelAccuracy: this.metricsCollector.getMetricValue('model_accuracy'),
      strategyPerformance: this.getStrategyPerformance(),
      timestamp: new Date().toISOString()
    }
  }

  generateCharts() {
    const now = Date.now()
    const oneHour = 60 * 60 * 1000
    const oneDay = 24 * oneHour

    // P&L chart data
    this.dashboardData.charts.pnl = this.generatePnLChart(now - oneDay, now)
    
    // Drawdown chart data
    this.dashboardData.charts.drawdown = this.generateDrawdownChart(now - oneDay, now)
    
    // Win rate chart data
    this.dashboardData.charts.winRate = this.generateWinRateChart(now - oneDay, now)
    
    // Volume chart data
    this.dashboardData.charts.volume = this.generateVolumeChart(now - oneDay, now)
    
    // System metrics chart
    this.dashboardData.charts.system = this.generateSystemChart(now - oneHour, now)
    
    // Strategy performance chart
    this.dashboardData.charts.strategies = this.generateStrategyChart(now - oneDay, now)
  }

  generatePnLChart(startTime, endTime) {
    // Generate mock P&L data for the last 24 hours
    const data = []
    const interval = 15 * 60 * 1000 // 15 minutes
    
    for (let time = startTime; time <= endTime; time += interval) {
      data.push({
        timestamp: new Date(time).toISOString(),
        pnl: Math.random() * 1000 - 500, // Mock data
        cumulative: Math.random() * 5000 - 2500
      })
    }
    
    return data
  }

  generateDrawdownChart(startTime, endTime) {
    // Generate mock drawdown data
    const data = []
    const interval = 15 * 60 * 1000
    
    for (let time = startTime; time <= endTime; time += interval) {
      data.push({
        timestamp: new Date(time).toISOString(),
        drawdown: Math.random() * 0.1 // 0-10% drawdown
      })
    }
    
    return data
  }

  generateWinRateChart(startTime, endTime) {
    // Generate mock win rate data
    const data = []
    const interval = 15 * 60 * 1000
    
    for (let time = startTime; time <= endTime; time += interval) {
      data.push({
        timestamp: new Date(time).toISOString(),
        winRate: Math.random() * 0.4 + 0.3 // 30-70% win rate
      })
    }
    
    return data
  }

  generateVolumeChart(startTime, endTime) {
    // Generate mock volume data
    const data = []
    const interval = 15 * 60 * 1000
    
    for (let time = startTime; time <= endTime; time += interval) {
      data.push({
        timestamp: new Date(time).toISOString(),
        volume: Math.random() * 1000000 // Mock volume
      })
    }
    
    return data
  }

  generateSystemChart(startTime, endTime) {
    // Generate mock system metrics
    const data = []
    const interval = 5 * 60 * 1000 // 5 minutes
    
    for (let time = startTime; time <= endTime; time += interval) {
      data.push({
        timestamp: new Date(time).toISOString(),
        cpu: Math.random() * 100,
        memory: Math.random() * 100,
        latency: Math.random() * 1000
      })
    }
    
    return data
  }

  generateStrategyChart(startTime, endTime) {
    // Generate mock strategy performance data
    const strategies = ['momentum', 'mean_reversion', 'scalping', 'trend_following']
    const data = []
    const interval = 15 * 60 * 1000
    
    for (let time = startTime; time <= endTime; time += interval) {
      const strategyData = {}
      strategies.forEach(strategy => {
        strategyData[strategy] = Math.random() * 1000 - 500
      })
      
      data.push({
        timestamp: new Date(time).toISOString(),
        ...strategyData
      })
    }
    
    return data
  }

  checkAlerts() {
    const alerts = []
    
    // System alerts
    if (this.dashboardData.system.memory.heapUsed / this.dashboardData.system.memory.heapTotal > 0.9) {
      alerts.push({
        type: 'system',
        severity: 'warning',
        message: 'High memory usage detected',
        timestamp: new Date().toISOString()
      })
    }
    
    if (this.dashboardData.system.cpu > 80) {
      alerts.push({
        type: 'system',
        severity: 'warning',
        message: 'High CPU usage detected',
        timestamp: new Date().toISOString()
      })
    }
    
    // Trading alerts
    if (this.dashboardData.trading.dailyPnL < -1000) {
      alerts.push({
        type: 'trading',
        severity: 'error',
        message: 'Significant daily loss detected',
        timestamp: new Date().toISOString()
      })
    }
    
    if (this.dashboardData.trading.maxDrawdown > 0.1) {
      alerts.push({
        type: 'trading',
        severity: 'warning',
        message: 'High drawdown detected',
        timestamp: new Date().toISOString()
      })
    }
    
    // Performance alerts
    if (this.dashboardData.performance.errorRate > 0.05) {
      alerts.push({
        type: 'performance',
        severity: 'error',
        message: 'High error rate detected',
        timestamp: new Date().toISOString()
      })
    }
    
    if (this.dashboardData.performance.latency > 1000) {
      alerts.push({
        type: 'performance',
        severity: 'warning',
        message: 'High latency detected',
        timestamp: new Date().toISOString()
      })
    }
    
    // Add new alerts
    this.dashboardData.alerts.push(...alerts)
    
    // Keep only last 100 alerts
    if (this.dashboardData.alerts.length > 100) {
      this.dashboardData.alerts = this.dashboardData.alerts.slice(-100)
    }
  }

  getCpuUsage() {
    // Mock CPU usage - in real implementation, use actual CPU monitoring
    return Math.random() * 100
  }

  calculateWinRate() {
    const totalTrades = this.metricsCollector.getMetricValue('trades_total')
    const winningTrades = this.metricsCollector.getMetricValue('trades_winning')
    
    if (totalTrades === 0) return 0
    return winningTrades / totalTrades
  }

  calculateSharpeRatio() {
    // Mock Sharpe ratio calculation
    return Math.random() * 2 - 1
  }

  calculateMaxDrawdown() {
    // Mock max drawdown calculation
    return Math.random() * 0.2
  }

  getStrategyPerformance() {
    // Mock strategy performance data
    return {
      momentum: { winRate: 0.65, pnl: 1500, trades: 45 },
      mean_reversion: { winRate: 0.58, pnl: 800, trades: 32 },
      scalping: { winRate: 0.72, pnl: 2200, trades: 78 },
      trend_following: { winRate: 0.61, pnl: 1200, trades: 28 }
    }
  }

  // Get dashboard data
  getDashboardData() {
    return this.dashboardData
  }

  // Get specific chart data
  getChartData(chartType) {
    return this.dashboardData.charts[chartType] || []
  }

  // Get alerts
  getAlerts(severity = null) {
    if (severity) {
      return this.dashboardData.alerts.filter(alert => alert.severity === severity)
    }
    return this.dashboardData.alerts
  }

  // Clear alerts
  clearAlerts() {
    this.dashboardData.alerts = []
    this.logger.info('Dashboard alerts cleared')
  }

  // Get system health
  getSystemHealth() {
    const health = {
      overall: 'healthy',
      components: {
        system: 'healthy',
        trading: 'healthy',
        performance: 'healthy'
      },
      issues: []
    }
    
    // Check system health
    if (this.dashboardData.system.memory.heapUsed / this.dashboardData.system.memory.heapTotal > 0.9) {
      health.components.system = 'warning'
      health.issues.push('High memory usage')
    }
    
    if (this.dashboardData.system.cpu > 80) {
      health.components.system = 'warning'
      health.issues.push('High CPU usage')
    }
    
    // Check trading health
    if (this.dashboardData.trading.dailyPnL < -1000) {
      health.components.trading = 'error'
      health.issues.push('Significant daily loss')
    }
    
    if (this.dashboardData.trading.maxDrawdown > 0.15) {
      health.components.trading = 'error'
      health.issues.push('High drawdown')
    }
    
    // Check performance health
    if (this.dashboardData.performance.errorRate > 0.05) {
      health.components.performance = 'error'
      health.issues.push('High error rate')
    }
    
    if (this.dashboardData.performance.latency > 2000) {
      health.components.performance = 'warning'
      health.issues.push('High latency')
    }
    
    // Determine overall health
    const componentHealths = Object.values(health.components)
    if (componentHealths.includes('error')) {
      health.overall = 'error'
    } else if (componentHealths.includes('warning')) {
      health.overall = 'warning'
    }
    
    return health
  }
}

export { MonitoringDashboard }
export default MonitoringDashboard