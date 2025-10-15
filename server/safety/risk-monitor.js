import { Logger } from '../utils/logger.js'
import { CircuitBreakers } from './circuit-breakers.js'

class RiskMonitor {
  constructor() {
    this.logger = new Logger()
    this.circuitBreakers = new CircuitBreakers()
    this.metrics = {
      dailyPnL: 0,
      maxDrawdown: 0,
      winRate: 0,
      sharpeRatio: 0,
      consecutiveLosses: 0,
      consecutiveWins: 0,
      tradesPerHour: 0,
      avgVolatility: 0,
      maxVolatility: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      account: {
        equity: 10000,
        balance: 10000,
        margin: 0,
        freeMargin: 10000,
        marginLevel: 0
      }
    }
    
    this.alerts = []
    this.riskLevel = 'low'
    this.isMonitoring = false
    this.monitorInterval = null
  }

  startMonitoring(intervalMs = 5000) {
    if (this.isMonitoring) {
      this.logger.warn('Risk monitor is already running')
      return
    }

    this.logger.info('Starting risk monitoring')
    this.isMonitoring = true

    // Initial risk assessment
    this.assessRisk()

    // Set up monitoring interval
    this.monitorInterval = setInterval(() => {
      try {
        this.assessRisk()
        this.checkCircuitBreakers()
        this.generateAlerts()
      } catch (error) {
        this.logger.error('Error in risk monitoring', { error: error.message })
      }
    }, intervalMs)
  }

  stopMonitoring() {
    if (!this.isMonitoring) {
      this.logger.warn('Risk monitor is not running')
      return
    }

    this.logger.info('Stopping risk monitoring')
    this.isMonitoring = false

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval)
      this.monitorInterval = null
    }
  }

  updateMetrics(metrics) {
    this.metrics = { ...this.metrics, ...metrics }
  }

  assessRisk() {
    const riskFactors = this.calculateRiskFactors()
    const riskScore = this.calculateRiskScore(riskFactors)
    const previousRiskLevel = this.riskLevel
    
    // Determine risk level
    if (riskScore >= 0.8) {
      this.riskLevel = 'critical'
    } else if (riskScore >= 0.6) {
      this.riskLevel = 'high'
    } else if (riskScore >= 0.4) {
      this.riskLevel = 'medium'
    } else {
      this.riskLevel = 'low'
    }

    // Log risk level change
    if (this.riskLevel !== previousRiskLevel) {
      this.logger.risk('RISK_LEVEL_CHANGED', {
        from: previousRiskLevel,
        to: this.riskLevel,
        score: riskScore,
        factors: riskFactors
      })
    }

    return {
      riskLevel: this.riskLevel,
      riskScore,
      factors: riskFactors
    }
  }

  calculateRiskFactors() {
    const factors = {}

    // Drawdown risk
    factors.drawdown = Math.min(this.metrics.maxDrawdown / 0.15, 1) // Normalize to 15% max

    // Daily loss risk
    const dailyLossPercent = Math.abs(this.metrics.dailyPnL) / this.metrics.account.equity
    factors.dailyLoss = Math.min(dailyLossPercent / 0.05, 1) // Normalize to 5% max

    // Win rate risk
    factors.winRate = this.metrics.winRate < 0.3 ? (0.3 - this.metrics.winRate) / 0.3 : 0

    // Consecutive losses risk
    factors.consecutiveLosses = Math.min(this.metrics.consecutiveLosses / 10, 1)

    // Volatility risk
    factors.volatility = Math.min(this.metrics.avgVolatility / 0.3, 1)

    // Overtrading risk
    factors.overtrading = Math.min(this.metrics.tradesPerHour / 50, 1)

    // Margin risk
    const marginUsage = this.metrics.account.margin / this.metrics.account.equity
    factors.margin = Math.min(marginUsage / 0.5, 1)

    // Sharpe ratio risk
    factors.sharpeRatio = this.metrics.sharpeRatio < 0 ? Math.abs(this.metrics.sharpeRatio) : 0

    return factors
  }

  calculateRiskScore(factors) {
    const weights = {
      drawdown: 0.25,
      dailyLoss: 0.20,
      winRate: 0.15,
      consecutiveLosses: 0.15,
      volatility: 0.10,
      overtrading: 0.05,
      margin: 0.05,
      sharpeRatio: 0.05
    }

    let score = 0
    for (const [factor, value] of Object.entries(factors)) {
      score += value * (weights[factor] || 0)
    }

    return Math.min(score, 1)
  }

  checkCircuitBreakers() {
    const context = {
      dailyPnL: this.metrics.dailyPnL,
      account: this.metrics.account,
      maxDrawdown: this.metrics.maxDrawdown,
      consecutiveLosses: this.metrics.consecutiveLosses,
      avgVolatility: this.metrics.avgVolatility,
      maxVolatility: this.metrics.maxVolatility,
      winRate: this.metrics.winRate,
      sharpeRatio: this.metrics.sharpeRatio,
      tradesPerHour: this.metrics.tradesPerHour,
      cpuUsage: this.getCpuUsage(),
      memoryUsage: this.getMemoryUsage()
    }

    const triggeredBreakers = this.circuitBreakers.checkBreakers(context)
    
    for (const breaker of triggeredBreakers) {
      const action = this.circuitBreakers.executeAction(breaker.action, context)
      this.handleBreakerAction(breaker.name, action)
    }

    return triggeredBreakers
  }

  handleBreakerAction(breakerName, action) {
    if (action.stopTrading) {
      this.logger.alert('error', `Trading stopped by ${breakerName} circuit breaker`)
      // Emit event to trading engine
      this.emit('circuit_breaker', { breaker: breakerName, action: 'stop_trading' })
    }
    
    if (action.emergencyStop) {
      this.logger.alert('error', `Emergency stop triggered by ${breakerName} circuit breaker`)
      this.emit('circuit_breaker', { breaker: breakerName, action: 'emergency_stop' })
    }
    
    if (action.reduceSize) {
      this.logger.alert('warn', `Position size reduced by ${breakerName} circuit breaker`)
      this.emit('circuit_breaker', { breaker: breakerName, action: 'reduce_size', factor: action.reduceSize })
    }
    
    if (action.slowDown) {
      this.logger.alert('warn', `Trading slowed down by ${breakerName} circuit breaker`)
      this.emit('circuit_breaker', { breaker: breakerName, action: 'slow_down', factor: action.slowDown })
    }
  }

  generateAlerts() {
    const alerts = []

    // High drawdown alert
    if (this.metrics.maxDrawdown > 0.1) {
      alerts.push({
        type: 'high_drawdown',
        severity: 'warning',
        message: `High drawdown detected: ${(this.metrics.maxDrawdown * 100).toFixed(2)}%`,
        data: { drawdown: this.metrics.maxDrawdown }
      })
    }

    // Daily loss alert
    if (this.metrics.dailyPnL < -this.metrics.account.equity * 0.03) {
      alerts.push({
        type: 'daily_loss',
        severity: 'warning',
        message: `Daily loss: $${Math.abs(this.metrics.dailyPnL).toFixed(2)}`,
        data: { dailyPnL: this.metrics.dailyPnL }
      })
    }

    // Low win rate alert
    if (this.metrics.winRate < 0.4 && this.metrics.totalTrades > 10) {
      alerts.push({
        type: 'low_win_rate',
        severity: 'info',
        message: `Low win rate: ${(this.metrics.winRate * 100).toFixed(1)}%`,
        data: { winRate: this.metrics.winRate }
      })
    }

    // High volatility alert
    if (this.metrics.avgVolatility > 0.2) {
      alerts.push({
        type: 'high_volatility',
        severity: 'info',
        message: `High volatility: ${(this.metrics.avgVolatility * 100).toFixed(1)}%`,
        data: { volatility: this.metrics.avgVolatility }
      })
    }

    // Consecutive losses alert
    if (this.metrics.consecutiveLosses >= 3) {
      alerts.push({
        type: 'consecutive_losses',
        severity: 'warning',
        message: `${this.metrics.consecutiveLosses} consecutive losses`,
        data: { consecutiveLosses: this.metrics.consecutiveLosses }
      })
    }

    // Overtrading alert
    if (this.metrics.tradesPerHour > 30) {
      alerts.push({
        type: 'overtrading',
        severity: 'info',
        message: `High trading frequency: ${this.metrics.tradesPerHour} trades/hour`,
        data: { tradesPerHour: this.metrics.tradesPerHour }
      })
    }

    // Add new alerts
    this.alerts.push(...alerts)

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(-100)
    }

    return alerts
  }

  getCpuUsage() {
    // This would get actual CPU usage
    // For now, return a mock value
    return Math.random() * 100
  }

  getMemoryUsage() {
    // This would get actual memory usage
    // For now, return a mock value
    return Math.random()
  }

  // Get risk summary
  getRiskSummary() {
    return {
      riskLevel: this.riskLevel,
      metrics: this.metrics,
      activeBreakers: this.circuitBreakers.getActiveBreakers(),
      recentAlerts: this.alerts.slice(-10),
      timestamp: new Date().toISOString()
    }
  }

  // Get alerts
  getAlerts(severity = null) {
    if (severity) {
      return this.alerts.filter(alert => alert.severity === severity)
    }
    return this.alerts
  }

  // Clear alerts
  clearAlerts() {
    this.alerts = []
    this.logger.info('Risk alerts cleared')
  }

  // Emit event (placeholder for event system)
  emit(event, data) {
    // This would emit events to the trading engine
    this.logger.debug(`Risk monitor event: ${event}`, data)
  }
}

export { RiskMonitor }
export default RiskMonitor