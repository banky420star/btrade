import { Logger } from '../utils/logger.js'
import { createClient } from 'redis'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class RiskManager {
  constructor() {
    this.logger = new Logger()
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    })
    
    // Risk limits and thresholds
    this.limits = {
      max_position_size: 0.1, // 10% of portfolio per position
      max_total_exposure: 0.8, // 80% of portfolio total exposure
      max_daily_loss: 0.05, // 5% max daily loss
      max_weekly_loss: 0.15, // 15% max weekly loss
      max_monthly_loss: 0.25, // 25% max monthly loss
      max_drawdown: 0.2, // 20% max drawdown
      max_correlation: 0.7, // Max correlation between positions
      max_sector_exposure: 0.3, // Max 30% exposure to any sector
      max_currency_exposure: 0.5, // Max 50% exposure to any currency
      var_limit: 0.03, // 3% Value at Risk limit
      stress_test_limit: 0.1, // 10% max loss in stress test
      max_leverage: 3.0, // Maximum leverage
      min_liquidity: 1000000, // Minimum daily volume for trading
      max_volatility: 0.05, // Maximum volatility for new positions
      min_confidence: 0.6, // Minimum confidence for new positions
      max_consecutive_losses: 5, // Max consecutive losses before stopping
      max_positions: 10, // Maximum number of positions
      position_timeout: 24 * 60 * 60 * 1000, // 24 hours max position hold time
      ...this.loadRiskConfig()
    }
    
    // Risk metrics
    this.metrics = {
      current_exposure: 0,
      daily_pnl: 0,
      weekly_pnl: 0,
      monthly_pnl: 0,
      current_drawdown: 0,
      max_drawdown: 0,
      var_95: 0,
      var_99: 0,
      expected_shortfall: 0,
      sharpe_ratio: 0,
      sortino_ratio: 0,
      calmar_ratio: 0,
      max_consecutive_losses: 0,
      current_consecutive_losses: 0,
      stress_test_results: {},
      correlation_matrix: {},
      sector_exposure: {},
      currency_exposure: {}
    }
    
    // Risk monitoring
    this.monitoring = {
      enabled: true,
      check_interval: 10000, // 10 seconds
      alert_thresholds: {
        exposure: 0.7,
        drawdown: 0.15,
        var: 0.025,
        consecutive_losses: 3
      }
    }
    
    // Risk history
    this.riskHistory = []
    this.maxHistorySize = 10000
    
    this.isInitialized = false
  }

  async initialize() {
    try {
      await this.redis.connect()
      await this.loadRiskState()
      this.startRiskMonitoring()
      this.isInitialized = true
      this.logger.info('RiskManager: Initialized successfully')
    } catch (error) {
      this.logger.error('RiskManager: Initialization failed', error)
      throw error
    }
  }

  async canOpenPosition(symbol, prediction) {
    if (!this.isInitialized) {
      throw new Error('RiskManager not initialized')
    }
    
    try {
      // Check basic risk limits
      if (!this.checkBasicLimits(symbol, prediction)) {
        return false
      }
      
      // Check exposure limits
      if (!this.checkExposureLimits(symbol, prediction)) {
        return false
      }
      
      // Check correlation limits
      if (!this.checkCorrelationLimits(symbol, prediction)) {
        return false
      }
      
      // Check volatility limits
      if (!this.checkVolatilityLimits(symbol, prediction)) {
        return false
      }
      
      // Check liquidity limits
      if (!this.checkLiquidityLimits(symbol, prediction)) {
        return false
      }
      
      // Check consecutive losses
      if (!this.checkConsecutiveLosses()) {
        return false
      }
      
      // Check VaR limits
      if (!this.checkVaRLimits(symbol, prediction)) {
        return false
      }
      
      return true
      
    } catch (error) {
      this.logger.error('Error checking if position can be opened:', error)
      return false
    }
  }

  checkBasicLimits(symbol, prediction) {
    // Check minimum confidence
    if (prediction.confidence < this.limits.min_confidence) {
      this.logger.warn(`Position rejected: Confidence too low (${prediction.confidence})`)
      return false
    }
    
    // Check maximum positions
    if (this.metrics.current_exposure >= this.limits.max_positions) {
      this.logger.warn('Position rejected: Maximum positions reached')
      return false
    }
    
    return true
  }

  checkExposureLimits(symbol, prediction) {
    // Check total exposure
    if (this.metrics.current_exposure >= this.limits.max_total_exposure) {
      this.logger.warn('Position rejected: Total exposure limit reached')
      return false
    }
    
    // Check position size
    const positionSize = this.calculatePositionSize(symbol, prediction)
    if (positionSize > this.limits.max_position_size) {
      this.logger.warn('Position rejected: Position size too large')
      return false
    }
    
    return true
  }

  checkCorrelationLimits(symbol, prediction) {
    // Check correlation with existing positions
    const correlation = this.calculateCorrelation(symbol, prediction)
    if (correlation > this.limits.max_correlation) {
      this.logger.warn(`Position rejected: High correlation (${correlation})`)
      return false
    }
    
    return true
  }

  checkVolatilityLimits(symbol, prediction) {
    // Check if symbol volatility is within limits
    const volatility = this.calculateVolatility(symbol)
    if (volatility > this.limits.max_volatility) {
      this.logger.warn(`Position rejected: Volatility too high (${volatility})`)
      return false
    }
    
    return true
  }

  checkLiquidityLimits(symbol, prediction) {
    // Check if symbol has sufficient liquidity
    const liquidity = this.calculateLiquidity(symbol)
    if (liquidity < this.limits.min_liquidity) {
      this.logger.warn(`Position rejected: Insufficient liquidity (${liquidity})`)
      return false
    }
    
    return true
  }

  checkConsecutiveLosses() {
    if (this.metrics.current_consecutive_losses >= this.limits.max_consecutive_losses) {
      this.logger.warn('Position rejected: Too many consecutive losses')
      return false
    }
    
    return true
  }

  checkVaRLimits(symbol, prediction) {
    // Check if new position would exceed VaR limit
    const newVaR = this.calculateNewVaR(symbol, prediction)
    if (newVaR > this.limits.var_limit) {
      this.logger.warn(`Position rejected: VaR limit exceeded (${newVaR})`)
      return false
    }
    
    return true
  }

  async shouldClosePosition(symbol, position) {
    try {
      // Check if position has been open too long
      const holdTime = Date.now() - position.entry_time
      if (holdTime > this.limits.position_timeout) {
        this.logger.warn(`Position ${symbol} closed: Timeout`)
        return true
      }
      
      // Check if position exceeds risk limits
      if (position.unrealized_pnl_pct < -this.limits.max_position_size * 2) {
        this.logger.warn(`Position ${symbol} closed: Risk limit exceeded`)
        return true
      }
      
      // Check if daily loss limit would be exceeded
      const dailyPnL = this.metrics.daily_pnl + position.unrealized_pnl
      if (dailyPnL < -this.limits.max_daily_loss) {
        this.logger.warn(`Position ${symbol} closed: Daily loss limit would be exceeded`)
        return true
      }
      
      // Check if drawdown limit would be exceeded
      const newDrawdown = this.calculateNewDrawdown(position)
      if (newDrawdown > this.limits.max_drawdown) {
        this.logger.warn(`Position ${symbol} closed: Drawdown limit would be exceeded`)
        return true
      }
      
      return false
      
    } catch (error) {
      this.logger.error('Error checking if position should be closed:', error)
      return false
    }
  }

  calculatePositionSize(symbol, prediction) {
    // Base position size
    let size = this.limits.max_position_size
    
    // Adjust based on confidence
    size *= prediction.confidence
    
    // Adjust based on volatility
    const volatility = this.calculateVolatility(symbol)
    size *= Math.max(0.5, 1 - volatility / this.limits.max_volatility)
    
    // Adjust based on correlation
    const correlation = this.calculateCorrelation(symbol, prediction)
    size *= Math.max(0.5, 1 - correlation)
    
    return Math.min(size, this.limits.max_position_size)
  }

  calculateCorrelation(symbol, prediction) {
    // Simplified correlation calculation
    // In production, implement proper correlation analysis
    return Math.random() * 0.5 // Placeholder
  }

  calculateVolatility(symbol) {
    // Simplified volatility calculation
    // In production, implement proper volatility calculation
    return Math.random() * 0.03 // Placeholder
  }

  calculateLiquidity(symbol) {
    // Simplified liquidity calculation
    // In production, implement proper liquidity calculation
    return Math.random() * 10000000 // Placeholder
  }

  calculateNewVaR(symbol, prediction) {
    // Simplified VaR calculation
    // In production, implement proper VaR calculation
    const currentVaR = this.metrics.var_95
    const positionVaR = this.calculatePositionSize(symbol, prediction) * 0.02 // 2% VaR per position
    return currentVaR + positionVaR
  }

  calculateNewDrawdown(position) {
    // Simplified drawdown calculation
    // In production, implement proper drawdown calculation
    const currentDrawdown = this.metrics.current_drawdown
    const positionDrawdown = Math.abs(position.unrealized_pnl_pct) / 100
    return Math.max(currentDrawdown, positionDrawdown)
  }

  async updateRiskMetrics(positions, trades, balance) {
    try {
      // Update exposure
      this.metrics.current_exposure = positions.size / this.limits.max_positions
      
      // Update P&L metrics
      this.updatePnLMetrics(trades)
      
      // Update drawdown
      this.updateDrawdownMetrics(balance)
      
      // Update VaR
      await this.updateVaRMetrics(positions)
      
      // Update correlation matrix
      await this.updateCorrelationMatrix(positions)
      
      // Update sector and currency exposure
      this.updateSectorExposure(positions)
      this.updateCurrencyExposure(positions)
      
      // Update consecutive losses
      this.updateConsecutiveLosses(trades)
      
      // Add to risk history
      this.addToRiskHistory()
      
    } catch (error) {
      this.logger.error('Error updating risk metrics:', error)
    }
  }

  updatePnLMetrics(trades) {
    const now = Date.now()
    const today = new Date(now).toDateString()
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toDateString()
    const monthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toDateString()
    
    // Calculate daily P&L
    const todayTrades = trades.filter(t => new Date(t.time).toDateString() === today)
    this.metrics.daily_pnl = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
    
    // Calculate weekly P&L
    const weeklyTrades = trades.filter(t => new Date(t.time).toDateString() >= weekAgo)
    this.metrics.weekly_pnl = weeklyTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
    
    // Calculate monthly P&L
    const monthlyTrades = trades.filter(t => new Date(t.time).toDateString() >= monthAgo)
    this.metrics.monthly_pnl = monthlyTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
  }

  updateDrawdownMetrics(balance) {
    // Calculate current drawdown
    const peak = Math.max(...this.riskHistory.map(r => r.balance), balance.total)
    this.metrics.current_drawdown = (peak - balance.total) / peak
    
    // Update max drawdown
    if (this.metrics.current_drawdown > this.metrics.max_drawdown) {
      this.metrics.max_drawdown = this.metrics.current_drawdown
    }
  }

  async updateVaRMetrics(positions) {
    // Simplified VaR calculation
    // In production, implement proper VaR calculation using historical simulation or Monte Carlo
    
    const totalExposure = Array.from(positions.values()).reduce((sum, pos) => sum + pos.size, 0)
    const volatility = this.calculatePortfolioVolatility(positions)
    
    // 95% VaR (1.65 standard deviations)
    this.metrics.var_95 = totalExposure * volatility * 1.65
    
    // 99% VaR (2.33 standard deviations)
    this.metrics.var_99 = totalExposure * volatility * 2.33
    
    // Expected Shortfall (Conditional VaR)
    this.metrics.expected_shortfall = totalExposure * volatility * 2.5
  }

  calculatePortfolioVolatility(positions) {
    // Simplified portfolio volatility calculation
    // In production, implement proper portfolio volatility calculation
    return 0.02 // 2% daily volatility placeholder
  }

  async updateCorrelationMatrix(positions) {
    // Simplified correlation matrix update
    // In production, implement proper correlation analysis
    const symbols = Array.from(positions.keys())
    const matrix = {}
    
    for (let i = 0; i < symbols.length; i++) {
      for (let j = 0; j < symbols.length; j++) {
        const key = `${symbols[i]}-${symbols[j]}`
        matrix[key] = Math.random() * 0.8 - 0.4 // Random correlation between -0.4 and 0.4
      }
    }
    
    this.metrics.correlation_matrix = matrix
  }

  updateSectorExposure(positions) {
    // Simplified sector exposure calculation
    // In production, implement proper sector classification
    const sectors = {
      'crypto': 0,
      'forex': 0,
      'stocks': 0
    }
    
    for (const [symbol, position] of positions) {
      if (symbol.includes('BTC') || symbol.includes('ETH') || symbol.includes('USDT')) {
        sectors.crypto += position.size
      } else if (symbol.includes('/')) {
        sectors.forex += position.size
      } else {
        sectors.stocks += position.size
      }
    }
    
    this.metrics.sector_exposure = sectors
  }

  updateCurrencyExposure(positions) {
    // Simplified currency exposure calculation
    // In production, implement proper currency classification
    const currencies = {
      'USD': 0,
      'EUR': 0,
      'BTC': 0,
      'ETH': 0
    }
    
    for (const [symbol, position] of positions) {
      if (symbol.includes('USD')) currencies.USD += position.size
      if (symbol.includes('EUR')) currencies.EUR += position.size
      if (symbol.includes('BTC')) currencies.BTC += position.size
      if (symbol.includes('ETH')) currencies.ETH += position.size
    }
    
    this.metrics.currency_exposure = currencies
  }

  updateConsecutiveLosses(trades) {
    let consecutiveLosses = 0
    let maxConsecutiveLosses = 0
    
    for (let i = trades.length - 1; i >= 0; i--) {
      const trade = trades[i]
      if (trade.pnl < 0) {
        consecutiveLosses++
        maxConsecutiveLosses = Math.max(maxConsecutiveLosses, consecutiveLosses)
      } else {
        break
      }
    }
    
    this.metrics.current_consecutive_losses = consecutiveLosses
    this.metrics.max_consecutive_losses = Math.max(this.metrics.max_consecutive_losses, maxConsecutiveLosses)
  }

  addToRiskHistory() {
    const riskRecord = {
      timestamp: Date.now(),
      balance: this.metrics.current_exposure,
      daily_pnl: this.metrics.daily_pnl,
      weekly_pnl: this.metrics.weekly_pnl,
      monthly_pnl: this.metrics.monthly_pnl,
      current_drawdown: this.metrics.current_drawdown,
      max_drawdown: this.metrics.max_drawdown,
      var_95: this.metrics.var_95,
      var_99: this.metrics.var_99,
      expected_shortfall: this.metrics.expected_shortfall,
      sharpe_ratio: this.metrics.sharpe_ratio,
      sortino_ratio: this.metrics.sortino_ratio,
      calmar_ratio: this.metrics.calmar_ratio,
      current_consecutive_losses: this.metrics.current_consecutive_losses,
      max_consecutive_losses: this.metrics.max_consecutive_losses
    }
    
    this.riskHistory.push(riskRecord)
    
    // Keep only recent history
    if (this.riskHistory.length > this.maxHistorySize) {
      this.riskHistory = this.riskHistory.slice(-this.maxHistorySize)
    }
  }

  startRiskMonitoring() {
    if (!this.monitoring.enabled) return
    
    setInterval(() => {
      this.checkRiskAlerts()
    }, this.monitoring.check_interval)
  }

  checkRiskAlerts() {
    const alerts = []
    
    // Check exposure alert
    if (this.metrics.current_exposure > this.monitoring.alert_thresholds.exposure) {
      alerts.push({
        type: 'exposure',
        message: `High exposure: ${(this.metrics.current_exposure * 100).toFixed(1)}%`,
        severity: 'warning'
      })
    }
    
    // Check drawdown alert
    if (this.metrics.current_drawdown > this.monitoring.alert_thresholds.drawdown) {
      alerts.push({
        type: 'drawdown',
        message: `High drawdown: ${(this.metrics.current_drawdown * 100).toFixed(1)}%`,
        severity: 'error'
      })
    }
    
    // Check VaR alert
    if (this.metrics.var_95 > this.monitoring.alert_thresholds.var) {
      alerts.push({
        type: 'var',
        message: `High VaR: ${(this.metrics.var_95 * 100).toFixed(1)}%`,
        severity: 'warning'
      })
    }
    
    // Check consecutive losses alert
    if (this.metrics.current_consecutive_losses > this.monitoring.alert_thresholds.consecutive_losses) {
      alerts.push({
        type: 'consecutive_losses',
        message: `Consecutive losses: ${this.metrics.current_consecutive_losses}`,
        severity: 'warning'
      })
    }
    
    // Log alerts
    for (const alert of alerts) {
      this.logger.warn(`Risk Alert: ${alert.message}`)
    }
    
    return alerts
  }

  async runStressTest() {
    this.logger.info('Running stress test...')
    
    const stressScenarios = [
      { name: 'Market Crash', price_change: -0.2 },
      { name: 'Volatility Spike', volatility_multiplier: 3.0 },
      { name: 'Liquidity Crisis', liquidity_multiplier: 0.1 },
      { name: 'Correlation Spike', correlation_multiplier: 2.0 }
    ]
    
    const results = {}
    
    for (const scenario of stressScenarios) {
      const loss = this.calculateStressTestLoss(scenario)
      results[scenario.name] = {
        loss,
        loss_pct: loss / 100000, // Assuming 100k portfolio
        passed: loss < this.limits.stress_test_limit * 100000
      }
    }
    
    this.metrics.stress_test_results = results
    this.logger.info('Stress test completed:', results)
    
    return results
  }

  calculateStressTestLoss(scenario) {
    // Simplified stress test calculation
    // In production, implement proper stress testing
    const baseLoss = 1000 // Base loss
    let loss = baseLoss
    
    if (scenario.price_change) {
      loss *= Math.abs(scenario.price_change) * 10
    }
    
    if (scenario.volatility_multiplier) {
      loss *= scenario.volatility_multiplier
    }
    
    if (scenario.liquidity_multiplier) {
      loss *= 1 / scenario.liquidity_multiplier
    }
    
    if (scenario.correlation_multiplier) {
      loss *= scenario.correlation_multiplier
    }
    
    return loss
  }

  async getRiskReport() {
    return {
      limits: this.limits,
      metrics: this.metrics,
      alerts: this.checkRiskAlerts(),
      stress_test: this.metrics.stress_test_results,
      history: this.riskHistory.slice(-100) // Last 100 records
    }
  }

  async saveRiskState() {
    try {
      const state = {
        limits: this.limits,
        metrics: this.metrics,
        riskHistory: this.riskHistory.slice(-1000) // Keep last 1000 records
      }
      
      const key = 'risk_manager_state'
      await this.redis.setex(key, 86400, JSON.stringify(state))
      
      // Also save to file as backup
      const filePath = path.join(__dirname, '../data/risk_manager_state.json')
      await fs.ensureDir(path.dirname(filePath))
      await fs.writeJson(filePath, state)
      
    } catch (error) {
      this.logger.error('Failed to save risk manager state:', error)
    }
  }

  async loadRiskState() {
    try {
      const key = 'risk_manager_state'
      const data = await this.redis.get(key)
      
      if (data) {
        const state = JSON.parse(data)
        
        this.limits = { ...this.limits, ...state.limits }
        this.metrics = { ...this.metrics, ...state.metrics }
        this.riskHistory = state.riskHistory || []
        
        this.logger.info('Risk manager state loaded successfully')
      }
    } catch (error) {
      this.logger.error('Failed to load risk manager state:', error)
    }
  }

  loadRiskConfig() {
    try {
      const configPath = path.join(__dirname, '../config/risk_config.json')
      if (fs.existsSync(configPath)) {
        return fs.readJsonSync(configPath)
      }
    } catch (error) {
      this.logger.error('Failed to load risk config:', error)
    }
    return {}
  }

  async cleanup() {
    try {
      await this.saveRiskState()
      await this.redis.quit()
      this.logger.info('RiskManager: Cleaned up successfully')
    } catch (error) {
      this.logger.error('RiskManager: Cleanup failed', error)
    }
  }
}