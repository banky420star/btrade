import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client'

class MetricsCollector {
  constructor() {
    this.metrics = new Map()
    this.initializeMetrics()
  }

  initializeMetrics() {
    // Collect default Node.js metrics
    collectDefaultMetrics({ register })

    // Trading metrics
    this.metrics.set('trades_total', new Counter({
      name: 'trades_total',
      help: 'Total number of trades executed',
      labelNames: ['symbol', 'side', 'status']
    }))

    this.metrics.set('trades_pnl', new Histogram({
      name: 'trades_pnl',
      help: 'P&L distribution of trades',
      labelNames: ['symbol', 'side'],
      buckets: [-1000, -500, -100, -50, -10, 0, 10, 50, 100, 500, 1000]
    }))

    this.metrics.set('positions_open', new Gauge({
      name: 'positions_open',
      help: 'Number of open positions',
      labelNames: ['symbol']
    }))

    this.metrics.set('account_equity', new Gauge({
      name: 'account_equity',
      help: 'Account equity value'
    }))

    this.metrics.set('account_balance', new Gauge({
      name: 'account_balance',
      help: 'Account balance value'
    }))

    this.metrics.set('account_margin_level', new Gauge({
      name: 'account_margin_level',
      help: 'Account margin level percentage'
    }))

    this.metrics.set('daily_pnl', new Gauge({
      name: 'daily_pnl',
      help: 'Daily P&L'
    }))

    this.metrics.set('max_drawdown', new Gauge({
      name: 'max_drawdown',
      help: 'Maximum drawdown percentage'
    }))

    // Model metrics
    this.metrics.set('model_accuracy', new Gauge({
      name: 'model_accuracy',
      help: 'Model accuracy percentage',
      labelNames: ['model_type']
    }))

    this.metrics.set('model_predictions', new Counter({
      name: 'model_predictions',
      help: 'Total number of model predictions',
      labelNames: ['model_type', 'action']
    }))

    this.metrics.set('model_training_duration', new Histogram({
      name: 'model_training_duration',
      help: 'Model training duration in seconds',
      labelNames: ['model_type'],
      buckets: [60, 300, 600, 1800, 3600, 7200, 14400]
    })

    // Risk metrics
    this.metrics.set('risk_events', new Counter({
      name: 'risk_events',
      help: 'Number of risk events triggered',
      labelNames: ['risk_type', 'severity']
    }))

    this.metrics.set('position_size', new Histogram({
      name: 'position_size',
      help: 'Position size distribution',
      labelNames: ['symbol'],
      buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1.0, 2.0, 5.0]
    }))

    // System metrics
    this.metrics.set('data_fetch_duration', new Histogram({
      name: 'data_fetch_duration',
      help: 'Data fetch duration in milliseconds',
      labelNames: ['exchange', 'symbol'],
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000]
    }))

    this.metrics.set('order_execution_duration', new Histogram({
      name: 'order_execution_duration',
      help: 'Order execution duration in milliseconds',
      labelNames: ['symbol', 'order_type'],
      buckets: [10, 50, 100, 200, 500, 1000, 2000, 5000]
    }))

    this.metrics.set('system_uptime', new Gauge({
      name: 'system_uptime',
      help: 'System uptime in seconds'
    }))

    this.metrics.set('active_connections', new Gauge({
      name: 'active_connections',
      help: 'Number of active WebSocket connections'
    }))

    // Performance metrics
    this.metrics.set('win_rate', new Gauge({
      name: 'win_rate',
      help: 'Win rate percentage'
    }))

    this.metrics.set('profit_factor', new Gauge({
      name: 'profit_factor',
      help: 'Profit factor ratio'
    }))

    this.metrics.set('sharpe_ratio', new Gauge({
      name: 'sharpe_ratio',
      help: 'Sharpe ratio'
    }))

    this.metrics.set('calmar_ratio', new Gauge({
      name: 'calmar_ratio',
      help: 'Calmar ratio'
    }))

    // Initialize uptime
    this.startTime = Date.now()
    this.updateUptime()
  }

  updateUptime() {
    const uptime = (Date.now() - this.startTime) / 1000
    this.metrics.get('system_uptime').set(uptime)
  }

  // Trading metrics
  recordTrade(symbol, side, status, pnl = 0) {
    this.metrics.get('trades_total').inc({ symbol, side, status })
    if (pnl !== 0) {
      this.metrics.get('trades_pnl').observe({ symbol, side }, pnl)
    }
  }

  updatePositions(symbol, count) {
    this.metrics.get('positions_open').set({ symbol }, count)
  }

  updateAccount(equity, balance, marginLevel) {
    this.metrics.get('account_equity').set(equity)
    this.metrics.get('account_balance').set(balance)
    this.metrics.get('account_margin_level').set(marginLevel)
  }

  updateDailyPnL(pnl) {
    this.metrics.get('daily_pnl').set(pnl)
  }

  updateMaxDrawdown(drawdown) {
    this.metrics.get('max_drawdown').set(drawdown)
  }

  // Model metrics
  updateModelAccuracy(modelType, accuracy) {
    this.metrics.get('model_accuracy').set({ model_type: modelType }, accuracy)
  }

  recordModelPrediction(modelType, action) {
    this.metrics.get('model_predictions').inc({ model_type: modelType, action })
  }

  recordModelTraining(modelType, duration) {
    this.metrics.get('model_training_duration').observe({ model_type: modelType }, duration)
  }

  // Risk metrics
  recordRiskEvent(riskType, severity) {
    this.metrics.get('risk_events').inc({ risk_type: riskType, severity })
  }

  recordPositionSize(symbol, size) {
    this.metrics.get('position_size').observe({ symbol }, size)
  }

  // System metrics
  recordDataFetch(exchange, symbol, duration) {
    this.metrics.get('data_fetch_duration').observe({ exchange, symbol }, duration)
  }

  recordOrderExecution(symbol, orderType, duration) {
    this.metrics.get('order_execution_duration').observe({ symbol, order_type: orderType }, duration)
  }

  updateActiveConnections(count) {
    this.metrics.get('active_connections').set(count)
  }

  // Performance metrics
  updatePerformanceMetrics(winRate, profitFactor, sharpeRatio, calmarRatio) {
    this.metrics.get('win_rate').set(winRate)
    this.metrics.get('profit_factor').set(profitFactor)
    this.metrics.get('sharpe_ratio').set(sharpeRatio)
    this.metrics.get('calmar_ratio').set(calmarRatio)
  }

  // Get all metrics
  getMetrics() {
    this.updateUptime()
    return register.metrics()
  }

  // Get specific metrics
  getTradingMetrics() {
    return {
      tradesTotal: this.metrics.get('trades_total'),
      tradesPnl: this.metrics.get('trades_pnl'),
      positionsOpen: this.metrics.get('positions_open'),
      accountEquity: this.metrics.get('account_equity'),
      accountBalance: this.metrics.get('account_balance'),
      dailyPnL: this.metrics.get('daily_pnl'),
      maxDrawdown: this.metrics.get('max_drawdown')
    }
  }

  getModelMetrics() {
    return {
      modelAccuracy: this.metrics.get('model_accuracy'),
      modelPredictions: this.metrics.get('model_predictions'),
      modelTrainingDuration: this.metrics.get('model_training_duration')
    }
  }

  getSystemMetrics() {
    return {
      systemUptime: this.metrics.get('system_uptime'),
      activeConnections: this.metrics.get('active_connections'),
      dataFetchDuration: this.metrics.get('data_fetch_duration'),
      orderExecutionDuration: this.metrics.get('order_execution_duration')
    }
  }

  getPerformanceMetrics() {
    return {
      winRate: this.metrics.get('win_rate'),
      profitFactor: this.metrics.get('profit_factor'),
      sharpeRatio: this.metrics.get('sharpe_ratio'),
      calmarRatio: this.metrics.get('calmar_ratio')
    }
  }

  // Reset metrics (useful for testing)
  reset() {
    register.clear()
    this.initializeMetrics()
  }

  // Get metrics summary
  getSummary() {
    this.updateUptime()
    
    return {
      trading: {
        totalTrades: this.getCounterValue('trades_total'),
        openPositions: this.getGaugeValue('positions_open'),
        accountEquity: this.getGaugeValue('account_equity'),
        dailyPnL: this.getGaugeValue('daily_pnl'),
        maxDrawdown: this.getGaugeValue('max_drawdown')
      },
      models: {
        accuracy: this.getGaugeValue('model_accuracy'),
        predictions: this.getCounterValue('model_predictions'),
        trainingDuration: this.getHistogramValue('model_training_duration')
      },
      system: {
        uptime: this.getGaugeValue('system_uptime'),
        activeConnections: this.getGaugeValue('active_connections'),
        dataFetchDuration: this.getHistogramValue('data_fetch_duration')
      },
      performance: {
        winRate: this.getGaugeValue('win_rate'),
        profitFactor: this.getGaugeValue('profit_factor'),
        sharpeRatio: this.getGaugeValue('sharpe_ratio'),
        calmarRatio: this.getGaugeValue('calmar_ratio')
      }
    }
  }

  getCounterValue(metricName) {
    const metric = this.metrics.get(metricName)
    return metric ? metric.get() : 0
  }

  getGaugeValue(metricName) {
    const metric = this.metrics.get(metricName)
    return metric ? metric.get() : 0
  }

  getHistogramValue(metricName) {
    const metric = this.metrics.get(metricName)
    if (!metric) return null
    
    const buckets = metric.get()
    return {
      count: buckets.count,
      sum: buckets.sum,
      buckets: buckets.buckets
    }
  }

  // Health check
  isHealthy() {
    const uptime = this.getGaugeValue('system_uptime')
    const activeConnections = this.getGaugeValue('active_connections')
    const marginLevel = this.getGaugeValue('account_margin_level')
    
    return {
      healthy: uptime > 0 && marginLevel > 200,
      uptime,
      activeConnections,
      marginLevel,
      timestamp: new Date().toISOString()
    }
  }
}

export { MetricsCollector }
export default MetricsCollector