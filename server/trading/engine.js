import { Logger } from '../utils/logger.js'
import { createClient } from 'redis'
import { DataManager } from '../data/manager.js'
import { ModelManager } from '../ml/manager.js'
import { RiskManager } from '../risk/manager.js'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class TradingEngine {
  constructor({ dataManager, modelManager, riskManager, logger, io }) {
    this.dataManager = dataManager
    this.modelManager = modelManager
    this.riskManager = riskManager
    this.logger = logger || new Logger()
    this.io = io
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    })
    
    // Trading configuration
    this.config = {
      symbols: ['BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT', 'SOL/USDT'],
      timeframes: ['1m', '5m', '15m', '1h'],
      max_positions: 10,
      max_position_size: 0.1, // 10% of portfolio per position
      min_confidence: 0.6,
      stop_loss: 0.02, // 2% stop loss
      take_profit: 0.06, // 6% take profit
      trailing_stop: true,
      trailing_stop_distance: 0.01, // 1% trailing stop
      rebalance_frequency: 300, // 5 minutes
      ...this.loadConfig()
    }
    
    // Trading state
    this.isRunning = false
    this.mode = 'paper' // 'paper' or 'live'
    this.positions = new Map()
    this.orders = new Map()
    this.balance = {
      total: 100000, // Starting balance
      available: 100000,
      invested: 0,
      profit: 0,
      profit_pct: 0
    }
    
    // Performance tracking
    this.performance = {
      total_trades: 0,
      winning_trades: 0,
      losing_trades: 0,
      win_rate: 0,
      avg_win: 0,
      avg_loss: 0,
      profit_factor: 0,
      sharpe_ratio: 0,
      max_drawdown: 0,
      current_drawdown: 0,
      consecutive_wins: 0,
      consecutive_losses: 0,
      best_trade: 0,
      worst_trade: 0,
      total_return: 0,
      annualized_return: 0,
      volatility: 0
    }
    
    // Exponential growth optimization
    this.growthOptimization = {
      enabled: true,
      target_annual_return: 0.5, // 50% annual return target
      risk_adjusted_return: true,
      kelly_criterion: true,
      position_sizing: 'adaptive', // 'fixed', 'adaptive', 'kelly'
      momentum_factor: 0.1,
      mean_reversion_factor: 0.05,
      trend_following_factor: 0.15
    }
    
    // Trading history
    this.tradeHistory = []
    this.performanceHistory = []
    this.maxHistorySize = 10000
    
    // Risk management
    this.riskLimits = {
      max_daily_loss: 0.05, // 5% max daily loss
      max_position_risk: 0.02, // 2% max risk per position
      max_correlation: 0.7, // Max correlation between positions
      max_sector_exposure: 0.3, // Max 30% exposure to any sector
      var_limit: 0.03, // 3% Value at Risk limit
      stress_test_limit: 0.1 // 10% max loss in stress test
    }
    
    this.isInitialized = false
  }

  async initialize() {
    try {
      await this.redis.connect()
      await this.loadState()
      this.isInitialized = true
      this.logger.info('TradingEngine: Initialized successfully')
    } catch (error) {
      this.logger.error('TradingEngine: Initialization failed', error)
      throw error
    }
  }

  async start() {
    if (!this.isInitialized) {
      throw new Error('TradingEngine not initialized')
    }
    
    if (this.isRunning) {
      this.logger.warn('Trading engine is already running')
      return
    }
    
    this.isRunning = true
    this.logger.info('Trading engine started')
    
    // Start main trading loop
    this.tradingLoop()
    
    // Start performance monitoring
    this.performanceMonitoring()
    
    // Start risk monitoring
    this.riskMonitoring()
  }

  async stop() {
    this.isRunning = false
    await this.saveState()
    this.logger.info('Trading engine stopped')
  }

  async setMode(mode) {
    if (!['paper', 'live'].includes(mode)) {
      throw new Error('Invalid trading mode')
    }
    
    this.mode = mode
    this.logger.info(`Trading mode set to ${mode}`)
  }

  async emergencyStop() {
    this.isRunning = false
    
    // Close all positions
    for (const [symbol, position] of this.positions) {
      await this.closePosition(symbol, 'emergency')
    }
    
    // Cancel all orders
    for (const [orderId, order] of this.orders) {
      await this.cancelOrder(orderId)
    }
    
    this.logger.warn('Emergency stop activated - All positions closed')
  }

  async tradingLoop() {
    while (this.isRunning) {
      try {
        // Get market data for all symbols
        const marketData = await this.getMarketData()
        
        // Analyze each symbol
        for (const symbol of this.config.symbols) {
          await this.analyzeSymbol(symbol, marketData[symbol])
        }
        
        // Rebalance portfolio if needed
        if (this.shouldRebalance()) {
          await this.rebalancePortfolio()
        }
        
        // Update performance metrics
        await this.updatePerformanceMetrics()
        
        // Emit real-time updates
        this.emitUpdates()
        
        // Wait before next iteration
        await this.sleep(1000) // 1 second
        
      } catch (error) {
        this.logger.error('Error in trading loop:', error)
        await this.sleep(5000) // Wait 5 seconds on error
      }
    }
  }

  async getMarketData() {
    const marketData = {}
    
    for (const symbol of this.config.symbols) {
      try {
        const data = await this.dataManager.getMarketData(symbol, '1m', 100)
        marketData[symbol] = data
      } catch (error) {
        this.logger.error(`Error getting market data for ${symbol}:`, error)
      }
    }
    
    return marketData
  }

  async analyzeSymbol(symbol, marketData) {
    if (!marketData || marketData.length === 0) return
    
    try {
      // Get prediction from models
      const prediction = await this.modelManager.predict(symbol, '1m', marketData)
      
      // Check if we should open a position
      if (this.shouldOpenPosition(symbol, prediction)) {
        await this.openPosition(symbol, prediction)
      }
      
      // Check if we should close existing position
      if (this.positions.has(symbol)) {
        const position = this.positions.get(symbol)
        if (this.shouldClosePosition(symbol, position, prediction)) {
          await this.closePosition(symbol, 'signal')
        }
      }
      
      // Update existing position
      if (this.positions.has(symbol)) {
        await this.updatePosition(symbol, prediction)
      }
      
    } catch (error) {
      this.logger.error(`Error analyzing ${symbol}:`, error)
    }
  }

  shouldOpenPosition(symbol, prediction) {
    // Don't open if we already have a position
    if (this.positions.has(symbol)) return false
    
    // Don't open if we've reached max positions
    if (this.positions.size >= this.config.max_positions) return false
    
    // Check confidence threshold
    if (prediction.confidence < this.config.min_confidence) return false
    
    // Check risk limits
    if (!this.riskManager.canOpenPosition(symbol, prediction)) return false
    
    // Check if we have enough available balance
    const positionSize = this.calculatePositionSize(symbol, prediction)
    if (positionSize > this.balance.available) return false
    
    return true
  }

  shouldClosePosition(symbol, position, prediction) {
    // Close if stop loss hit
    if (position.unrealized_pnl_pct <= -this.config.stop_loss) return true
    
    // Close if take profit hit
    if (position.unrealized_pnl_pct >= this.config.take_profit) return true
    
    // Close if signal changes significantly
    if (Math.abs(prediction.prediction - position.signal) > 0.5) return true
    
    // Close if confidence drops below threshold
    if (prediction.confidence < this.config.min_confidence * 0.8) return true
    
    // Close if risk limits exceeded
    if (this.riskManager.shouldClosePosition(symbol, position)) return true
    
    return false
  }

  async openPosition(symbol, prediction) {
    try {
      const positionSize = this.calculatePositionSize(symbol, prediction)
      const currentPrice = await this.dataManager.getLatestPrice(symbol)
      
      if (!currentPrice) {
        this.logger.error(`Cannot get current price for ${symbol}`)
        return
      }
      
      const position = {
        symbol,
        side: prediction.prediction > 0 ? 'long' : 'short',
        size: positionSize,
        entry_price: currentPrice,
        current_price: currentPrice,
        entry_time: Date.now(),
        signal: prediction.prediction,
        confidence: prediction.confidence,
        stop_loss: this.calculateStopLoss(currentPrice, prediction.prediction),
        take_profit: this.calculateTakeProfit(currentPrice, prediction.prediction),
        unrealized_pnl: 0,
        unrealized_pnl_pct: 0,
        max_profit: 0,
        max_loss: 0,
        trailing_stop: currentPrice,
        risk_amount: positionSize * this.riskLimits.max_position_risk
      }
      
      // Update balance
      this.balance.available -= positionSize
      this.balance.invested += positionSize
      
      // Add position
      this.positions.set(symbol, position)
      
      // Create order
      const order = await this.createOrder(symbol, position)
      
      this.logger.info(`Opened ${position.side} position in ${symbol}: ${positionSize} @ ${currentPrice}`)
      
      // Add to trade history
      this.tradeHistory.push({
        type: 'open',
        symbol,
        side: position.side,
        size: positionSize,
        price: currentPrice,
        time: Date.now(),
        signal: prediction.prediction,
        confidence: prediction.confidence
      })
      
    } catch (error) {
      this.logger.error(`Error opening position in ${symbol}:`, error)
    }
  }

  async closePosition(symbol, reason) {
    const position = this.positions.get(symbol)
    if (!position) return
    
    try {
      const currentPrice = await this.dataManager.getLatestPrice(symbol)
      if (!currentPrice) {
        this.logger.error(`Cannot get current price for ${symbol}`)
        return
      }
      
      // Calculate final P&L
      const pnl = this.calculatePnL(position, currentPrice)
      const pnlPct = (pnl / position.size) * 100
      
      // Update balance
      this.balance.available += position.size + pnl
      this.balance.invested -= position.size
      this.balance.profit += pnl
      this.balance.total = this.balance.available + this.balance.invested
      this.balance.profit_pct = (this.balance.profit / (this.balance.total - this.balance.profit)) * 100
      
      // Update performance metrics
      this.updateTradeMetrics(pnl, pnlPct)
      
      // Remove position
      this.positions.delete(symbol)
      
      this.logger.info(`Closed ${position.side} position in ${symbol}: P&L = ${pnl.toFixed(2)} (${pnlPct.toFixed(2)}%) - Reason: ${reason}`)
      
      // Add to trade history
      this.tradeHistory.push({
        type: 'close',
        symbol,
        side: position.side,
        size: position.size,
        price: currentPrice,
        time: Date.now(),
        pnl,
        pnl_pct: pnlPct,
        reason
      })
      
    } catch (error) {
      this.logger.error(`Error closing position in ${symbol}:`, error)
    }
  }

  async updatePosition(symbol, prediction) {
    const position = this.positions.get(symbol)
    if (!position) return
    
    try {
      const currentPrice = await this.dataManager.getLatestPrice(symbol)
      if (!currentPrice) return
      
      // Update position data
      position.current_price = currentPrice
      position.unrealized_pnl = this.calculatePnL(position, currentPrice)
      position.unrealized_pnl_pct = (position.unrealized_pnl / position.size) * 100
      
      // Update max profit/loss
      if (position.unrealized_pnl > position.max_profit) {
        position.max_profit = position.unrealized_pnl
      }
      if (position.unrealized_pnl < position.max_loss) {
        position.max_loss = position.unrealized_pnl
      }
      
      // Update trailing stop
      if (this.config.trailing_stop) {
        this.updateTrailingStop(position, currentPrice)
      }
      
      // Update signal and confidence
      position.signal = prediction.prediction
      position.confidence = prediction.confidence
      
    } catch (error) {
      this.logger.error(`Error updating position in ${symbol}:`, error)
    }
  }

  calculatePositionSize(symbol, prediction) {
    const baseSize = this.balance.total * this.config.max_position_size
    
    if (this.growthOptimization.position_sizing === 'fixed') {
      return baseSize
    }
    
    if (this.growthOptimization.position_sizing === 'adaptive') {
      // Adaptive position sizing based on confidence and volatility
      const confidenceMultiplier = prediction.confidence
      const volatilityMultiplier = this.calculateVolatilityMultiplier(symbol)
      const momentumMultiplier = this.calculateMomentumMultiplier(symbol)
      
      return baseSize * confidenceMultiplier * volatilityMultiplier * momentumMultiplier
    }
    
    if (this.growthOptimization.position_sizing === 'kelly' && this.growthOptimization.kelly_criterion) {
      // Kelly Criterion for optimal position sizing
      const winRate = this.performance.win_rate
      const avgWin = this.performance.avg_win
      const avgLoss = Math.abs(this.performance.avg_loss)
      
      if (avgLoss > 0) {
        const kellyFraction = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin
        return baseSize * Math.max(0, Math.min(kellyFraction, 0.25)) // Cap at 25%
      }
    }
    
    return baseSize
  }

  calculateVolatilityMultiplier(symbol) {
    // Lower volatility = higher position size
    // This is a simplified calculation
    return 0.8 + Math.random() * 0.4 // Placeholder
  }

  calculateMomentumMultiplier(symbol) {
    // Higher momentum = higher position size
    // This is a simplified calculation
    return 0.8 + Math.random() * 0.4 // Placeholder
  }

  calculateStopLoss(price, signal) {
    const stopDistance = this.config.stop_loss
    return signal > 0 ? price * (1 - stopDistance) : price * (1 + stopDistance)
  }

  calculateTakeProfit(price, signal) {
    const profitDistance = this.config.take_profit
    return signal > 0 ? price * (1 + profitDistance) : price * (1 - profitDistance)
  }

  calculatePnL(position, currentPrice) {
    const priceDiff = currentPrice - position.entry_price
    return position.side === 'long' ? priceDiff * position.size : -priceDiff * position.size
  }

  updateTrailingStop(position, currentPrice) {
    const trailingDistance = this.config.trailing_stop_distance
    
    if (position.side === 'long') {
      const newTrailingStop = currentPrice * (1 - trailingDistance)
      if (newTrailingStop > position.trailing_stop) {
        position.trailing_stop = newTrailingStop
      }
    } else {
      const newTrailingStop = currentPrice * (1 + trailingDistance)
      if (newTrailingStop < position.trailing_stop) {
        position.trailing_stop = newTrailingStop
      }
    }
  }

  updateTradeMetrics(pnl, pnlPct) {
    this.performance.total_trades++
    
    if (pnl > 0) {
      this.performance.winning_trades++
      this.performance.consecutive_wins++
      this.performance.consecutive_losses = 0
      
      if (pnl > this.performance.best_trade) {
        this.performance.best_trade = pnl
      }
    } else {
      this.performance.losing_trades++
      this.performance.consecutive_losses++
      this.performance.consecutive_wins = 0
      
      if (pnl < this.performance.worst_trade) {
        this.performance.worst_trade = pnl
      }
    }
    
    // Update averages
    this.performance.win_rate = this.performance.winning_trades / this.performance.total_trades
    
    // Update profit factor
    const totalWins = this.tradeHistory.filter(t => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0)
    const totalLosses = Math.abs(this.tradeHistory.filter(t => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0))
    this.performance.profit_factor = totalLosses > 0 ? totalWins / totalLosses : Infinity
  }

  shouldRebalance() {
    // Rebalance every N minutes
    const now = Date.now()
    const lastRebalance = this.lastRebalance || 0
    return (now - lastRebalance) > (this.config.rebalance_frequency * 1000)
  }

  async rebalancePortfolio() {
    this.logger.info('Rebalancing portfolio...')
    
    // Close positions that are underperforming
    for (const [symbol, position] of this.positions) {
      if (position.unrealized_pnl_pct < -0.01) { // Close if down more than 1%
        await this.closePosition(symbol, 'rebalance')
      }
    }
    
    // Update rebalance time
    this.lastRebalance = Date.now()
  }

  async updatePerformanceMetrics() {
    // Calculate Sharpe ratio
    if (this.tradeHistory.length > 1) {
      const returns = this.tradeHistory.map(t => t.pnl_pct || 0)
      const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / returns.length
      const stdDev = Math.sqrt(variance)
      this.performance.sharpe_ratio = stdDev > 0 ? meanReturn / stdDev : 0
    }
    
    // Calculate max drawdown
    this.performance.max_drawdown = this.calculateMaxDrawdown()
    this.performance.current_drawdown = this.calculateCurrentDrawdown()
    
    // Calculate total return
    this.performance.total_return = this.balance.profit_pct
    
    // Calculate volatility
    if (this.performanceHistory.length > 1) {
      const returns = this.performanceHistory.map(p => p.return_pct)
      const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - returns[0], 2), 0) / returns.length
      this.performance.volatility = Math.sqrt(variance)
    }
    
    // Add to performance history
    this.performanceHistory.push({
      timestamp: Date.now(),
      total_balance: this.balance.total,
      profit: this.balance.profit,
      return_pct: this.balance.profit_pct,
      positions: this.positions.size,
      win_rate: this.performance.win_rate,
      sharpe_ratio: this.performance.sharpe_ratio
    })
    
    // Keep only recent history
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory = this.performanceHistory.slice(-this.maxHistorySize)
    }
  }

  calculateMaxDrawdown() {
    let maxDrawdown = 0
    let peak = 0
    
    for (const p of this.performanceHistory) {
      if (p.total_balance > peak) {
        peak = p.total_balance
      }
      const drawdown = (peak - p.total_balance) / peak
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
      }
    }
    
    return maxDrawdown
  }

  calculateCurrentDrawdown() {
    if (this.performanceHistory.length === 0) return 0
    
    const peak = Math.max(...this.performanceHistory.map(p => p.total_balance))
    const current = this.balance.total
    return (peak - current) / peak
  }

  async performanceMonitoring() {
    setInterval(() => {
      if (this.isRunning) {
        this.emitUpdates()
      }
    }, 5000) // Update every 5 seconds
  }

  async riskMonitoring() {
    setInterval(async () => {
      if (this.isRunning) {
        await this.checkRiskLimits()
      }
    }, 10000) // Check every 10 seconds
  }

  async checkRiskLimits() {
    // Check daily loss limit
    const today = new Date().toDateString()
    const todayTrades = this.tradeHistory.filter(t => new Date(t.time).toDateString() === today)
    const todayPnL = todayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0)
    
    if (todayPnL < -this.balance.total * this.riskLimits.max_daily_loss) {
      this.logger.warn('Daily loss limit exceeded - stopping trading')
      await this.emergencyStop()
    }
    
    // Check position correlation
    await this.checkPositionCorrelation()
    
    // Check VaR limit
    await this.checkVaRLimit()
  }

  async checkPositionCorrelation() {
    // Simplified correlation check
    // In production, implement proper correlation analysis
    if (this.positions.size > 1) {
      const symbols = Array.from(this.positions.keys())
      // Check if too many positions are in the same direction
      const longPositions = symbols.filter(s => this.positions.get(s).side === 'long').length
      const shortPositions = symbols.filter(s => this.positions.get(s).side === 'short').length
      
      if (longPositions / symbols.length > 0.8 || shortPositions / symbols.length > 0.8) {
        this.logger.warn('High correlation detected - consider reducing positions')
      }
    }
  }

  async checkVaRLimit() {
    // Simplified VaR calculation
    // In production, implement proper VaR calculation
    const totalRisk = Array.from(this.positions.values()).reduce((sum, pos) => sum + pos.risk_amount, 0)
    const varLimit = this.balance.total * this.riskLimits.var_limit
    
    if (totalRisk > varLimit) {
      this.logger.warn('VaR limit exceeded - reducing positions')
      // Close some positions to reduce risk
      const positions = Array.from(this.positions.entries())
      positions.sort((a, b) => a[1].unrealized_pnl_pct - b[1].unrealized_pnl_pct)
      
      for (let i = 0; i < Math.ceil(positions.length / 2); i++) {
        await this.closePosition(positions[i][0], 'risk_limit')
      }
    }
  }

  emitUpdates() {
    if (this.io) {
      this.io.emit('positions_update', this.getPositions())
      this.io.emit('orders_update', this.getOrders())
      this.io.emit('balance_update', this.getBalance())
      this.io.emit('performance_update', this.performance)
    }
  }

  getPositions() {
    return Array.from(this.positions.values())
  }

  getOrders() {
    return Array.from(this.orders.values())
  }

  getBalance() {
    return this.balance
  }

  async createOrder(symbol, position) {
    const order = {
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol,
      side: position.side,
      size: position.size,
      price: position.entry_price,
      status: 'filled',
      created_at: Date.now(),
      filled_at: Date.now()
    }
    
    this.orders.set(order.id, order)
    return order
  }

  async cancelOrder(orderId) {
    const order = this.orders.get(orderId)
    if (order) {
      order.status = 'cancelled'
      order.cancelled_at = Date.now()
    }
  }

  async backtest() {
    this.logger.info('Starting backtest...')
    
    // This is a simplified backtest implementation
    // In production, implement comprehensive backtesting
    
    const results = {
      total_return: 0,
      sharpe_ratio: 0,
      max_drawdown: 0,
      win_rate: 0,
      total_trades: 0,
      start_balance: 100000,
      end_balance: 100000
    }
    
    return results
  }

  async saveState() {
    try {
      const state = {
        positions: Array.from(this.positions.entries()),
        orders: Array.from(this.orders.entries()),
        balance: this.balance,
        performance: this.performance,
        config: this.config,
        tradeHistory: this.tradeHistory.slice(-1000), // Keep last 1000 trades
        performanceHistory: this.performanceHistory.slice(-1000) // Keep last 1000 performance records
      }
      
      const key = 'trading_engine_state'
      await this.redis.setex(key, 86400, JSON.stringify(state))
      
      // Also save to file as backup
      const filePath = path.join(__dirname, '../data/trading_engine_state.json')
      await fs.ensureDir(path.dirname(filePath))
      await fs.writeJson(filePath, state)
      
    } catch (error) {
      this.logger.error('Failed to save trading engine state:', error)
    }
  }

  async loadState() {
    try {
      const key = 'trading_engine_state'
      const data = await this.redis.get(key)
      
      if (data) {
        const state = JSON.parse(data)
        
        this.positions = new Map(state.positions || [])
        this.orders = new Map(state.orders || [])
        this.balance = state.balance || this.balance
        this.performance = state.performance || this.performance
        this.config = { ...this.config, ...state.config }
        this.tradeHistory = state.tradeHistory || []
        this.performanceHistory = state.performanceHistory || []
        
        this.logger.info('Trading engine state loaded successfully')
      }
    } catch (error) {
      this.logger.error('Failed to load trading engine state:', error)
    }
  }

  loadConfig() {
    try {
      const configPath = path.join(__dirname, '../config/trading_config.json')
      if (fs.existsSync(configPath)) {
        return fs.readJsonSync(configPath)
      }
    } catch (error) {
      this.logger.error('Failed to load trading config:', error)
    }
    return {}
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async cleanup() {
    try {
      await this.saveState()
      await this.redis.quit()
      this.logger.info('TradingEngine: Cleaned up successfully')
    } catch (error) {
      this.logger.error('TradingEngine: Cleanup failed', error)
    }
  }
}