import { Logger } from '../utils/logger.js'
import { DataManager } from '../data/manager.js'
import { ModelManager } from '../ml/manager.js'
import { RiskManager } from '../risk/manager.js'
import { MetricsCollector } from '../monitoring/metrics.js'
import { AdvancedStrategies } from '../strategies/advanced-strategies.js'
import { MultiTimeframeAnalysis } from '../analysis/multi-timeframe.js'
import { MarketScanner } from '../scanner/market-scanner.js'
import { v4 as uuidv4 } from 'uuid'

class TradingEngine {
  constructor({ dataManager, modelManager, riskManager, logger, io }) {
    this.dataManager = dataManager
    this.modelManager = modelManager
    this.riskManager = riskManager
    this.logger = logger
    this.io = io
    this.metricsCollector = new MetricsCollector()
    
    // Initialize advanced components
    this.strategies = new AdvancedStrategies()
    this.multiTimeframe = new MultiTimeframeAnalysis(dataManager)
    this.marketScanner = new MarketScanner(dataManager)
    
    this.isRunning = false
    this.tradingMode = 'paper'
    this.positions = new Map()
    this.orders = new Map()
    this.balance = {
      equity: 10000,
      balance: 10000,
      margin: 0,
      freeMargin: 10000,
      marginLevel: 0
    }
    
    this.symbols = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD']
    this.timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
    this.tradingInterval = null
    this.dataStreamInterval = null
    this.scannerInterval = null
    
    // Advanced trading configuration
    this.config = {
      maxPositions: 10,
      maxRiskPerTrade: 0.02, // 2% per trade
      maxDailyRisk: 0.05, // 5% daily
      minConfidence: 0.6, // Minimum signal confidence
      strategyWeights: {
        momentum: 0.3,
        mean_reversion: 0.2,
        scalping: 0.2,
        trend_following: 0.2,
        volatility: 0.1
      },
      timeframes: {
        primary: '5m',
        secondary: '1h',
        trend: '4h'
      }
    }
    
    this.performance = {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnL: 0,
      maxDrawdown: 0,
      winRate: 0,
      profitFactor: 0,
      sharpeRatio: 0,
      calmarRatio: 0,
      strategyPerformance: new Map()
    }
    
    this.opportunities = []
    this.alerts = []
  }

  async initialize() {
    this.logger.info('Initializing TradingEngine')
    
    try {
      // Initialize components
      await this.dataManager.initialize()
      await this.modelManager.initialize()
      await this.riskManager.initialize()
      
      // Load historical data for backtesting
      await this.loadHistoricalData()
      
      this.logger.info('TradingEngine initialized successfully')
    } catch (error) {
      this.logger.error('Failed to initialize TradingEngine', { error: error.message })
      throw error
    }
  }

  async loadHistoricalData() {
    this.logger.info('Loading historical data for trading')
    
    for (const symbol of this.symbols) {
      try {
        const data = await this.dataManager.getTrainingData(symbol, '1h', 1000)
        this.logger.debug(`Loaded ${data.length} historical records for ${symbol}`)
      } catch (error) {
        this.logger.warn(`Failed to load historical data for ${symbol}`, { error: error.message })
      }
    }
  }

  async start() {
    if (this.isRunning) {
      this.logger.warn('Trading engine is already running')
      return
    }

    this.logger.info('Starting advanced trading engine')
    this.isRunning = true
    
    // Start data streaming
    this.startDataStream()
    
    // Start market scanner
    await this.marketScanner.startScanning(30000) // Scan every 30 seconds
    
    // Start trading loop
    this.startTradingLoop()
    
    // Start opportunity scanner
    this.startOpportunityScanner()
    
    this.logger.system('TRADING_STARTED', 'success')
  }

  async stop() {
    if (!this.isRunning) {
      this.logger.warn('Trading engine is not running')
      return
    }

    this.logger.info('Stopping advanced trading engine')
    this.isRunning = false
    
    // Stop market scanner
    this.marketScanner.stopScanning()
    
    // Clear intervals
    if (this.tradingInterval) {
      clearInterval(this.tradingInterval)
      this.tradingInterval = null
    }
    
    if (this.dataStreamInterval) {
      clearInterval(this.dataStreamInterval)
      this.dataStreamInterval = null
    }
    
    if (this.scannerInterval) {
      clearInterval(this.scannerInterval)
      this.scannerInterval = null
    }
    
    this.logger.system('TRADING_STOPPED', 'success')
  }

  async emergencyStop() {
    this.logger.warn('Emergency stop triggered')
    
    // Close all positions
    for (const [positionId, position] of this.positions) {
      await this.closePosition(positionId, 'emergency')
    }
    
    // Cancel all orders
    for (const [orderId, order] of this.orders) {
      await this.cancelOrder(orderId)
    }
    
    // Stop trading
    await this.stop()
    
    this.logger.system('EMERGENCY_STOP', 'error')
  }

  startDataStream() {
    this.dataStreamInterval = setInterval(async () => {
      try {
        await this.dataManager.fetchLatestData()
        this.updateMetrics()
      } catch (error) {
        this.logger.error('Error in data stream', { error: error.message })
      }
    }, 5000) // Update every 5 seconds
  }

  startTradingLoop() {
    this.tradingInterval = setInterval(async () => {
      if (!this.isRunning) return
      
      try {
        await this.tradingCycle()
      } catch (error) {
        this.logger.error('Error in trading cycle', { error: error.message })
      }
    }, 30000) // Run every 30 seconds
  }

  startOpportunityScanner() {
    this.scannerInterval = setInterval(async () => {
      if (!this.isRunning) return
      
      try {
        await this.scanOpportunities()
      } catch (error) {
        this.logger.error('Error in opportunity scanner', { error: error.message })
      }
    }, 10000) // Scan every 10 seconds
  }

  async tradingCycle() {
    this.logger.debug('Starting trading cycle')
    
    // Check if market is open
    if (!this.dataManager.isMarketOpen()) {
      this.logger.debug('Market is closed, skipping trading cycle')
      return
    }
    
    // Update positions
    await this.updatePositions()
    
    // Check for exit signals
    await this.checkExitSignals()
    
    // Check for entry signals
    await this.checkEntrySignals()
    
    // Update performance metrics
    this.updatePerformanceMetrics()
    
    // Emit updates to frontend
    this.emitUpdates()
  }

  async updatePositions() {
    for (const [positionId, position] of this.positions) {
      try {
        const currentPrice = await this.dataManager.getCurrentPrice(position.symbol)
        if (currentPrice) {
          const updatedPosition = this.riskManager.updatePositionPnl(positionId, currentPrice)
          if (updatedPosition) {
            this.positions.set(positionId, updatedPosition)
          }
        }
      } catch (error) {
        this.logger.error(`Failed to update position ${positionId}`, { error: error.message })
      }
    }
  }

  async checkExitSignals() {
    for (const [positionId, position] of this.positions) {
      try {
        const currentPrice = position.currentPrice
        const entryPrice = position.entryPrice
        const side = position.side
        
        // Check stop loss
        if (position.stopLoss) {
          const shouldStopLoss = side === 'long' 
            ? currentPrice <= position.stopLoss
            : currentPrice >= position.stopLoss
            
          if (shouldStopLoss) {
            await this.closePosition(positionId, 'stop_loss')
            continue
          }
        }
        
        // Check take profit
        if (position.takeProfit) {
          const shouldTakeProfit = side === 'long'
            ? currentPrice >= position.takeProfit
            : currentPrice <= position.takeProfit
            
          if (shouldTakeProfit) {
            await this.closePosition(positionId, 'take_profit')
            continue
          }
        }
        
        // Check ML exit signals
        const features = await this.dataManager.getTrainingData(position.symbol, '1h', 1)
        if (features.length > 0) {
          const prediction = await this.modelManager.ensemblePredict(features[0])
          
          const shouldExit = (side === 'long' && prediction.action === 'sell') ||
                           (side === 'short' && prediction.action === 'buy')
                           
          if (shouldExit && prediction.confidence > 0.7) {
            await this.closePosition(positionId, 'ml_signal')
          }
        }
      } catch (error) {
        this.logger.error(`Failed to check exit signals for position ${positionId}`, { error: error.message })
      }
    }
  }

  async checkEntrySignals() {
    // Get high-confidence opportunities from market scanner
    const opportunities = this.marketScanner.getHighConfidenceOpportunities(this.config.minConfidence)
    
    for (const opportunity of opportunities) {
      try {
        const { symbol, type, confidence, strategy, reason } = opportunity
        
        // Skip if we already have a position in this symbol
        const hasPosition = Array.from(this.positions.values()).some(p => p.symbol === symbol)
        if (hasPosition) continue
        
        // Get current price
        const currentPrice = await this.dataManager.getCurrentPrice(symbol)
        if (!currentPrice) continue
        
        // Get multi-timeframe analysis
        const analysis = await this.multiTimeframe.analyzeSymbol(symbol)
        
        // Additional ML prediction
        const features = await this.dataManager.getTrainingData(symbol, this.config.timeframes.primary, 1)
        if (features.length === 0) continue
        
        const mlPrediction = await this.modelManager.ensemblePredict(features[0])
        
        // Combine strategy signal with ML prediction
        const combinedConfidence = (confidence + mlPrediction.confidence) / 2
        
        if (combinedConfidence > this.config.minConfidence) {
          await this.enterPosition(symbol, type, currentPrice, features[0], {
            strategy,
            reason,
            confidence: combinedConfidence,
            mlConfidence: mlPrediction.confidence,
            analysis
          })
        }
      } catch (error) {
        this.logger.error(`Failed to check entry signals for opportunity`, { error: error.message })
      }
    }
  }

  async scanOpportunities() {
    try {
      // Get latest scan results
      const scanResults = this.marketScanner.getLatestResults()
      if (!scanResults) return
      
      // Update opportunities and alerts
      this.opportunities = scanResults.opportunities || []
      this.alerts = scanResults.alerts || []
      
      // Emit updates to frontend
      if (this.io) {
        this.io.emit('opportunities_update', this.opportunities)
        this.io.emit('alerts_update', this.alerts)
      }
      
      this.logger.debug(`Found ${this.opportunities.length} opportunities and ${this.alerts.length} alerts`)
    } catch (error) {
      this.logger.error('Error scanning opportunities', { error: error.message })
    }
  }

  async enterPosition(symbol, action, price, features, metadata = {}) {
    try {
      const side = action === 'buy' ? 'long' : 'short'
      
      // Get risk recommendations with advanced analysis
      const atr = features.atr || 0.001
      const volatility = features.volatility || 0.1
      const analysis = metadata.analysis || {}
      
      // Adjust risk based on analysis
      let riskMultiplier = 1.0
      if (analysis.overallStrength > 0.8) riskMultiplier = 1.2 // Increase size for strong signals
      if (analysis.riskLevel === 'high') riskMultiplier = 0.5 // Reduce size for high risk
      
      const recommendations = this.riskManager.getPositionRecommendations(
        symbol, price, atr, 0.6, 0.02, 0.01
      )
      
      if (!recommendations.canOpen) {
        this.logger.debug(`Cannot open position for ${symbol}: risk check failed`)
        return
      }
      
      // Adjust position size based on confidence and analysis
      const adjustedSize = recommendations.recommendedSize * riskMultiplier * (metadata.confidence || 1.0)
      
      // Create position with advanced metadata
      const positionId = uuidv4()
      const position = {
        id: positionId,
        symbol,
        side,
        size: adjustedSize,
        entryPrice: price,
        currentPrice: price,
        stopLoss: recommendations.stopLoss,
        takeProfit: recommendations.takeProfit,
        pnl: 0,
        pnlPercent: 0,
        timestamp: new Date().toISOString(),
        metadata: {
          strategy: metadata.strategy || 'unknown',
          reason: metadata.reason || 'ML signal',
          confidence: metadata.confidence || 0.5,
          mlConfidence: metadata.mlConfidence || 0.5,
          analysis: analysis,
          riskLevel: analysis.riskLevel || 'medium',
          volatility: volatility
        }
      }
      
      // Add to risk manager
      this.riskManager.addPosition(position)
      
      // Add to positions
      this.positions.set(positionId, position)
      
      // Record trade
      this.recordTrade(symbol, side, 'filled', 0)
      
      // Update strategy performance tracking
      this.updateStrategyPerformance(metadata.strategy || 'unknown', true)
      
      this.logger.trade('OPEN', symbol, adjustedSize, price, {
        positionId,
        side,
        stopLoss: recommendations.stopLoss,
        takeProfit: recommendations.takeProfit,
        strategy: metadata.strategy,
        confidence: metadata.confidence,
        riskLevel: analysis.riskLevel
      })
      
    } catch (error) {
      this.logger.error(`Failed to enter position for ${symbol}`, { error: error.message })
    }
  }

  async closePosition(positionId, reason) {
    try {
      const position = this.positions.get(positionId)
      if (!position) {
        this.logger.warn(`Position ${positionId} not found`)
        return
      }
      
      const pnl = position.pnl
      const side = position.side === 'long' ? 'sell' : 'buy'
      
      // Remove from risk manager
      this.riskManager.removePosition(positionId)
      
      // Remove from positions
      this.positions.delete(positionId)
      
      // Record trade
      this.recordTrade(position.symbol, side, 'filled', pnl)
      
      // Update performance
      this.updateTradePerformance(pnl)
      
      this.logger.trade('CLOSE', position.symbol, position.size, position.currentPrice, {
        positionId,
        reason,
        pnl
      })
      
    } catch (error) {
      this.logger.error(`Failed to close position ${positionId}`, { error: error.message })
    }
  }

  async cancelOrder(orderId) {
    try {
      const order = this.orders.get(orderId)
      if (!order) {
        this.logger.warn(`Order ${orderId} not found`)
        return
      }
      
      order.status = 'cancelled'
      this.orders.set(orderId, order)
      
      this.logger.order(orderId, order.symbol, order.type, order.side, order.quantity, order.price, 'cancelled')
      
    } catch (error) {
      this.logger.error(`Failed to cancel order ${orderId}`, { error: error.message })
    }
  }

  recordTrade(symbol, side, status, pnl) {
    this.metricsCollector.recordTrade(symbol, side, status, pnl)
    this.performance.totalTrades++
    
    if (status === 'filled') {
      if (pnl > 0) {
        this.performance.winningTrades++
      } else if (pnl < 0) {
        this.performance.losingTrades++
      }
      
      this.performance.totalPnL += pnl
    }
  }

  updateTradePerformance(pnl) {
    // Update win rate
    this.performance.winRate = this.performance.totalTrades > 0 
      ? this.performance.winningTrades / this.performance.totalTrades 
      : 0
    
    // Update profit factor
    const grossProfit = this.performance.winningTrades * 0.02 // Simplified
    const grossLoss = this.performance.losingTrades * 0.01 // Simplified
    this.performance.profitFactor = grossLoss > 0 ? grossProfit / grossLoss : 0
    
    // Update balance
    this.balance.equity += pnl
    this.balance.balance = this.balance.equity
    
    // Update risk manager
    this.riskManager.updateAccount(
      this.balance.equity,
      this.balance.balance,
      this.balance.margin,
      this.balance.freeMargin
    )
  }

  updatePerformanceMetrics() {
    // Calculate Sharpe ratio (simplified)
    const returns = this.performance.totalPnL / this.balance.equity
    const volatility = 0.1 // Simplified
    this.performance.sharpeRatio = volatility > 0 ? returns / volatility : 0
    
    // Calculate Calmar ratio (simplified)
    this.performance.calmarRatio = this.performance.maxDrawdown > 0 
      ? returns / this.performance.maxDrawdown 
      : 0
    
    // Update metrics
    this.metricsCollector.updatePerformanceMetrics(
      this.performance.winRate,
      this.performance.profitFactor,
      this.performance.sharpeRatio,
      this.performance.calmarRatio
    )
    
    this.metricsCollector.updateAccount(
      this.balance.equity,
      this.balance.balance,
      this.balance.marginLevel
    )
  }

  updateMetrics() {
    // Update position counts
    for (const symbol of this.symbols) {
      const count = Array.from(this.positions.values()).filter(p => p.symbol === symbol).length
      this.metricsCollector.updatePositions(symbol, count)
    }
    
    // Update daily P&L
    this.metricsCollector.updateDailyPnL(this.performance.totalPnL)
    
    // Update max drawdown
    this.metricsCollector.updateMaxDrawdown(this.performance.maxDrawdown)
  }

  updateStrategyPerformance(strategyName, isWin) {
    if (!this.performance.strategyPerformance.has(strategyName)) {
      this.performance.strategyPerformance.set(strategyName, {
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        totalPnL: 0,
        winRate: 0
      })
    }
    
    const strategyPerf = this.performance.strategyPerformance.get(strategyName)
    strategyPerf.totalTrades++
    
    if (isWin) {
      strategyPerf.winningTrades++
    } else {
      strategyPerf.losingTrades++
    }
    
    strategyPerf.winRate = strategyPerf.winningTrades / strategyPerf.totalTrades
  }

  emitUpdates() {
    if (this.io) {
      this.io.emit('positions_update', this.getPositions())
      this.io.emit('orders_update', this.getOrders())
      this.io.emit('balance_update', this.getBalance())
      this.io.emit('metrics_update', this.metricsCollector.getSummary())
      this.io.emit('opportunities_update', this.opportunities)
      this.io.emit('alerts_update', this.alerts)
    }
  }

  // Getters
  getPositions() {
    return Array.from(this.positions.values())
  }

  getOrders() {
    return Array.from(this.orders.values())
  }

  getBalance() {
    return this.balance
  }

  getPerformance() {
    return this.performance
  }

  // Trading mode
  async setMode(mode) {
    if (!['paper', 'live'].includes(mode)) {
      throw new Error('Invalid trading mode')
    }
    
    this.tradingMode = mode
    this.logger.info(`Trading mode set to ${mode}`)
  }

  // Backtesting
  async backtest(startDate, endDate, initialCapital = 10000) {
    this.logger.info('Starting backtest')
    
    try {
      const results = {
        initialCapital,
        finalCapital: initialCapital,
        totalReturn: 0,
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        trades: []
      }
      
      // Simulate backtesting logic here
      // This would involve running the strategy on historical data
      
      this.logger.info('Backtest completed', results)
      return results
    } catch (error) {
      this.logger.error('Backtest failed', { error: error.message })
      throw error
    }
  }
}

export { TradingEngine }
export default TradingEngine