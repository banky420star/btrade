import { Logger } from '../utils/logger.js'
import { SimpleStatistics } from 'simple-statistics'

class RiskManager {
  constructor() {
    this.logger = new Logger()
    this.config = {
      maxPositionSize: 0.02, // 2% of account per position
      maxDailyLoss: 0.05, // 5% max daily loss
      maxDrawdown: 0.15, // 15% max drawdown
      maxCorrelation: 0.7, // Max correlation between positions
      maxPositions: 10, // Max number of open positions
      stopLossATR: 2.0, // Stop loss at 2x ATR
      takeProfitATR: 3.0, // Take profit at 3x ATR
      kellyFraction: 0.25, // Kelly criterion fraction
      emergencyStop: false
    }
    
    this.account = {
      balance: 10000,
      equity: 10000,
      margin: 0,
      freeMargin: 10000,
      marginLevel: 0
    }
    
    this.positions = []
    this.dailyPnL = 0
    this.peakEquity = 10000
    this.maxDrawdown = 0
    this.tradeHistory = []
  }

  async initialize() {
    this.logger.info('Initializing RiskManager')
    this.logger.info('Risk configuration loaded', this.config)
  }

  // Advanced Position Sizing using Kelly Criterion with Multiple Factors
  calculatePositionSize(symbol, entryPrice, stopLoss, winRate, avgWin, avgLoss, metadata = {}) {
    if (this.config.emergencyStop) {
      return 0
    }

    // Get additional risk factors
    const volatility = metadata.volatility || 0.1
    const confidence = metadata.confidence || 0.5
    const analysis = metadata.analysis || {}
    const strategy = metadata.strategy || 'unknown'
    
    // Calculate base Kelly fraction
    const baseKellyFraction = this.calculateKellyFraction(winRate, avgWin, avgLoss)
    
    // Apply confidence adjustment
    const confidenceAdjustedKelly = baseKellyFraction * confidence
    
    // Apply volatility adjustment (higher volatility = smaller position)
    const volatilityAdjustment = Math.max(0.1, 1 - (volatility * 2))
    const volatilityAdjustedKelly = confidenceAdjustedKelly * volatilityAdjustment
    
    // Apply analysis strength adjustment
    const strengthAdjustment = analysis.overallStrength || 0.5
    const strengthAdjustedKelly = volatilityAdjustedKelly * (0.5 + strengthAdjustment)
    
    // Apply strategy-specific adjustments
    const strategyAdjustment = this.getStrategyRiskAdjustment(strategy)
    const strategyAdjustedKelly = strengthAdjustedKelly * strategyAdjustment
    
    // Apply correlation adjustment
    const correlationAdjustment = this.getCorrelationAdjustment(symbol)
    const correlationAdjustedKelly = strategyAdjustedKelly * correlationAdjustment
    
    // Apply drawdown adjustment
    const drawdownAdjustment = this.getDrawdownAdjustment()
    const drawdownAdjustedKelly = correlationAdjustedKelly * drawdownAdjustment
    
    // Final Kelly fraction with limits
    const finalKellyFraction = Math.min(
      Math.max(drawdownAdjustedKelly, 0.01), // Minimum 1%
      this.config.kellyFraction // Maximum Kelly fraction
    )
    
    // Calculate position size based on risk
    const riskAmount = this.account.equity * this.config.maxPositionSize
    const stopDistance = Math.abs(entryPrice - stopLoss)
    const basePositionSize = riskAmount / stopDistance
    
    // Apply Kelly sizing
    const kellySize = this.account.equity * finalKellyFraction
    const finalSize = Math.min(basePositionSize, kellySize)
    
    // Apply maximum position size limit
    const maxSize = this.account.equity * this.config.maxPositionSize
    const finalPositionSize = Math.min(finalSize, maxSize)
    
    // Apply minimum position size
    const minSize = this.account.equity * 0.001 // 0.1% minimum
    const finalPositionSizeWithMin = Math.max(finalPositionSize, minSize)
    
    this.logger.debug('Advanced position size calculation', {
      symbol,
      entryPrice,
      stopLoss,
      winRate,
      avgWin,
      avgLoss,
      volatility,
      confidence,
      strategy,
      baseKellyFraction,
      finalKellyFraction,
      riskAmount,
      positionSize: finalPositionSizeWithMin,
      adjustments: {
        confidence: confidenceAdjustedKelly / baseKellyFraction,
        volatility: volatilityAdjustment,
        strength: strengthAdjustment,
        strategy: strategyAdjustment,
        correlation: correlationAdjustment,
        drawdown: drawdownAdjustment
      }
    })
    
    return Math.max(0, finalPositionSizeWithMin)
  }

  calculateKellyFraction(winRate, avgWin, avgLoss) {
    if (avgLoss === 0 || winRate <= 0 || winRate >= 1) {
      return 0
    }
    
    const b = avgWin / avgLoss // Win/Loss ratio
    const p = winRate // Win rate
    const q = 1 - p // Loss rate
    
    const kelly = (b * p - q) / b
    return Math.max(0, kelly)
  }

  // Strategy-specific risk adjustments
  getStrategyRiskAdjustment(strategy) {
    const adjustments = {
      'momentum_breakout': 1.2,      // Higher risk, higher reward
      'momentum_continuation': 1.1,  // Good momentum
      'momentum_reversal': 0.8,      // Reversal is risky
      'mean_reversion_bb': 0.9,      // Mean reversion is moderate risk
      'mean_reversion_rsi': 0.9,     // RSI mean reversion
      'mean_reversion_stochastic': 0.9,
      'scalping_momentum': 1.3,      // Scalping is high risk
      'scalping_mean_reversion': 1.1,
      'scalping_breakout': 1.2,
      'trend_following_ma': 0.8,     // Trend following is lower risk
      'trend_following_ichimoku': 0.8,
      'trend_following_adx': 0.9,
      'volatility_breakout': 1.1,    // Volatility strategies
      'volatility_squeeze': 1.0,
      'volatility_expansion': 1.1,
      'news_sentiment': 0.7,         // News trading is risky
      'economic_calendar': 0.7,
      'multi_timeframe_trend': 0.6,  // Multi-timeframe is safer
      'multi_timeframe_momentum': 0.8,
      'divergence': 0.9,             // Divergence strategies
      'unknown': 1.0                 // Default
    }
    
    return adjustments[strategy] || 1.0
  }

  // Correlation-based risk adjustment
  getCorrelationAdjustment(symbol) {
    const correlatedPositions = this.positions.size
    const maxCorrelated = 3 // Maximum correlated positions
    
    if (correlatedPositions >= maxCorrelated) {
      return 0.5 // Reduce position size if too many correlated positions
    }
    
    return 1.0 - (correlatedPositions * 0.1) // Slight reduction per correlated position
  }

  // Drawdown-based risk adjustment
  getDrawdownAdjustment() {
    const currentDrawdown = this.maxDrawdown
    
    if (currentDrawdown > 0.1) { // 10% drawdown
      return 0.5 // Reduce position size by 50%
    } else if (currentDrawdown > 0.05) { // 5% drawdown
      return 0.7 // Reduce position size by 30%
    } else if (currentDrawdown > 0.02) { // 2% drawdown
      return 0.9 // Reduce position size by 10%
    }
    
    return 1.0 // No adjustment
  }

  // Advanced risk checks before opening position
  canOpenPosition(symbol, side, size, entryPrice, metadata = {}) {
    const checks = {
      emergencyStop: !this.config.emergencyStop,
      maxPositions: this.positions.length < this.config.maxPositions,
      dailyLoss: this.dailyPnL > -this.account.equity * this.config.maxDailyLoss,
      drawdown: this.maxDrawdown < this.config.maxDrawdown,
      margin: this.hasEnoughMargin(size, entryPrice),
      correlation: this.checkCorrelation(symbol, side),
      volatility: this.checkVolatilityRisk(symbol, metadata),
      concentration: this.checkConcentrationRisk(symbol, size),
      timeBased: this.checkTimeBasedRisk(),
      strategy: this.checkStrategyRisk(metadata.strategy),
      confidence: this.checkConfidenceRisk(metadata.confidence),
      marketHours: this.checkMarketHours(),
      newsEvents: this.checkNewsEvents(),
      liquidity: this.checkLiquidityRisk(symbol, size)
    }

    const canOpen = Object.values(checks).every(check => check === true)
    
    if (!canOpen) {
      this.logger.risk('POSITION_BLOCKED', {
        symbol,
        side,
        size,
        entryPrice,
        checks,
        metadata
      })
    }

    return { canOpen, checks }
  }

  // Volatility risk check
  checkVolatilityRisk(symbol, metadata) {
    const volatility = metadata.volatility || 0.1
    const maxVolatility = 0.5 // 50% max volatility
    
    if (volatility > maxVolatility) {
      this.logger.risk('HIGH_VOLATILITY', {
        symbol,
        volatility,
        maxVolatility
      })
      return false
    }
    
    return true
  }

  // Concentration risk check
  checkConcentrationRisk(symbol, size) {
    const totalExposure = Array.from(this.positions.values())
      .reduce((sum, pos) => sum + (pos.size * pos.currentPrice), 0)
    
    const newExposure = size * (this.account.equity / 10000) // Normalize
    const totalAfterNew = totalExposure + newExposure
    const maxExposure = this.account.equity * 0.5 // 50% max total exposure
    
    if (totalAfterNew > maxExposure) {
      this.logger.risk('EXCESSIVE_EXPOSURE', {
        symbol,
        currentExposure: totalExposure,
        newExposure,
        totalAfterNew,
        maxExposure
      })
      return false
    }
    
    return true
  }

  // Time-based risk check
  checkTimeBasedRisk() {
    const now = new Date()
    const hour = now.getHours()
    const day = now.getDay()
    
    // Avoid trading during low liquidity hours (22:00-02:00 UTC)
    if (hour >= 22 || hour <= 2) {
      this.logger.risk('LOW_LIQUIDITY_HOURS', { hour })
      return false
    }
    
    // Avoid trading on weekends
    if (day === 0 || day === 6) {
      this.logger.risk('WEEKEND_TRADING', { day })
      return false
    }
    
    return true
  }

  // Strategy-specific risk check
  checkStrategyRisk(strategy) {
    const riskyStrategies = ['scalping_momentum', 'news_sentiment', 'economic_calendar']
    
    if (riskyStrategies.includes(strategy)) {
      // Additional checks for risky strategies
      if (this.positions.size > 5) {
        this.logger.risk('TOO_MANY_RISKY_POSITIONS', { strategy, positionCount: this.positions.size })
        return false
      }
    }
    
    return true
  }

  // Confidence risk check
  checkConfidenceRisk(confidence) {
    const minConfidence = 0.6
    
    if (confidence < minConfidence) {
      this.logger.risk('LOW_CONFIDENCE', { confidence, minConfidence })
      return false
    }
    
    return true
  }

  // Market hours check
  checkMarketHours() {
    const now = new Date()
    const hour = now.getHours()
    const day = now.getDay()
    
    // Forex market is closed on weekends
    if (day === 0 || day === 6) {
      return false
    }
    
    // Check for major market sessions
    const isLondonSession = hour >= 7 && hour < 16
    const isNewYorkSession = hour >= 12 && hour < 21
    const isTokyoSession = hour >= 0 && hour < 9
    
    return isLondonSession || isNewYorkSession || isTokyoSession
  }

  // News events check
  checkNewsEvents() {
    // This would integrate with economic calendar
    // For now, return true (no news events)
    return true
  }

  // Liquidity risk check
  checkLiquidityRisk(symbol, size) {
    // This would check actual market liquidity
    // For now, return true (assume sufficient liquidity)
    return true
  }

  hasEnoughMargin(size, price) {
    const requiredMargin = size * price * 0.01 // 1% margin requirement
    return this.account.freeMargin >= requiredMargin
  }

  checkCorrelation(symbol, side) {
    if (this.positions.length === 0) return true
    
    // Simple correlation check based on currency pairs
    const baseCurrency = symbol.split('/')[0]
    const quoteCurrency = symbol.split('/')[1]
    
    const correlatedPositions = this.positions.filter(pos => {
      const posBase = pos.symbol.split('/')[0]
      const posQuote = pos.symbol.split('/')[1]
      
      return posBase === baseCurrency || posQuote === quoteCurrency ||
             posBase === quoteCurrency || posQuote === baseCurrency
    })
    
    return correlatedPositions.length < 3 // Max 3 correlated positions
  }

  // Stop loss and take profit calculation
  calculateStopLoss(entryPrice, side, atr) {
    const stopDistance = atr * this.config.stopLossATR
    return side === 'long' 
      ? entryPrice - stopDistance
      : entryPrice + stopDistance
  }

  calculateTakeProfit(entryPrice, side, atr) {
    const profitDistance = atr * this.config.takeProfitATR
    return side === 'long'
      ? entryPrice + profitDistance
      : entryPrice - profitDistance
  }

  // Update account balance
  updateAccount(balance, equity, margin, freeMargin) {
    this.account = { balance, equity, margin, freeMargin, marginLevel: 0 }
    
    if (margin > 0) {
      this.account.marginLevel = (equity / margin) * 100
    }
    
    // Update daily P&L
    this.dailyPnL = equity - balance
    
    // Update peak equity and drawdown
    if (equity > this.peakEquity) {
      this.peakEquity = equity
    }
    
    const currentDrawdown = (this.peakEquity - equity) / this.peakEquity
    this.maxDrawdown = Math.max(this.maxDrawdown, currentDrawdown)
    
    this.logger.debug('Account updated', {
      balance,
      equity,
      margin,
      freeMargin,
      marginLevel: this.account.marginLevel,
      dailyPnL: this.dailyPnL,
      maxDrawdown: this.maxDrawdown
    })
  }

  // Add position
  addPosition(position) {
    this.positions.push(position)
    this.logger.position(
      position.symbol,
      position.side,
      position.size,
      position.entryPrice,
      position.currentPrice,
      position.pnl,
      { positionId: position.id }
    )
  }

  // Remove position
  removePosition(positionId) {
    const index = this.positions.findIndex(p => p.id === positionId)
    if (index !== -1) {
      const position = this.positions[index]
      this.positions.splice(index, 1)
      
      this.logger.info('Position closed', {
        positionId,
        symbol: position.symbol,
        pnl: position.pnl
      })
      
      return position
    }
    return null
  }

  // Update position P&L
  updatePositionPnl(positionId, currentPrice) {
    const position = this.positions.find(p => p.id === positionId)
    if (position) {
      const priceDiff = currentPrice - position.entryPrice
      const pnl = position.side === 'long' 
        ? priceDiff * position.size
        : -priceDiff * position.size
      
      position.currentPrice = currentPrice
      position.pnl = pnl
      position.pnlPercent = (pnl / (position.entryPrice * position.size)) * 100
      
      return position
    }
    return null
  }

  // Risk monitoring
  checkRiskLimits() {
    const risks = {
      dailyLoss: this.dailyPnL < -this.account.equity * this.config.maxDailyLoss,
      drawdown: this.maxDrawdown > this.config.maxDrawdown,
      marginLevel: this.account.marginLevel < 200, // 200% margin level
      tooManyPositions: this.positions.length > this.config.maxPositions
    }

    const criticalRisks = Object.entries(risks)
      .filter(([_, triggered]) => triggered)
      .map(([risk, _]) => risk)

    if (criticalRisks.length > 0) {
      this.logger.risk('CRITICAL_RISK_DETECTED', {
        risks: criticalRisks,
        dailyPnL: this.dailyPnL,
        maxDrawdown: this.maxDrawdown,
        marginLevel: this.account.marginLevel,
        positionCount: this.positions.length
      })
      
      // Trigger emergency stop if critical risks
      if (criticalRisks.includes('dailyLoss') || criticalRisks.includes('drawdown')) {
        this.triggerEmergencyStop()
      }
    }

    return { risks, criticalRisks }
  }

  triggerEmergencyStop() {
    this.config.emergencyStop = true
    this.logger.alert('error', 'Emergency stop triggered due to risk limits')
    
    // Close all positions
    this.positions.forEach(position => {
      this.logger.trade('EMERGENCY_CLOSE', position.symbol, position.size, position.currentPrice, {
        reason: 'Emergency stop',
        positionId: position.id
      })
    })
    
    this.positions = []
  }

  resetEmergencyStop() {
    this.config.emergencyStop = false
    this.logger.info('Emergency stop reset')
  }

  // Get risk metrics
  getRiskMetrics() {
    const totalExposure = this.positions.reduce((sum, pos) => 
      sum + (pos.size * pos.currentPrice), 0
    )
    
    const leverage = totalExposure / this.account.equity
    
    return {
      account: this.account,
      positions: this.positions.length,
      totalExposure,
      leverage,
      dailyPnL: this.dailyPnL,
      maxDrawdown: this.maxDrawdown,
      marginLevel: this.account.marginLevel,
      emergencyStop: this.config.emergencyStop,
      riskLimits: {
        maxPositionSize: this.config.maxPositionSize,
        maxDailyLoss: this.config.maxDailyLoss,
        maxDrawdown: this.config.maxDrawdown,
        maxPositions: this.config.maxPositions
      }
    }
  }

  // Update configuration
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
    this.logger.info('Risk configuration updated', newConfig)
  }

  // Get position recommendations
  getPositionRecommendations(symbol, currentPrice, atr, winRate, avgWin, avgLoss) {
    const recommendations = {
      canOpen: false,
      recommendedSize: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskAmount: 0,
      riskPercent: 0
    }

    if (this.config.emergencyStop) {
      return recommendations
    }

    const { canOpen, checks } = this.canOpenPosition(symbol, 'long', 1, currentPrice)
    
    if (canOpen) {
      const size = this.calculatePositionSize(symbol, currentPrice, 0, winRate, avgWin, avgLoss)
      const stopLoss = this.calculateStopLoss(currentPrice, 'long', atr)
      const takeProfit = this.calculateTakeProfit(currentPrice, 'long', atr)
      const riskAmount = Math.abs(currentPrice - stopLoss) * size
      const riskPercent = (riskAmount / this.account.equity) * 100

      recommendations.canOpen = true
      recommendations.recommendedSize = size
      recommendations.stopLoss = stopLoss
      recommendations.takeProfit = takeProfit
      recommendations.riskAmount = riskAmount
      recommendations.riskPercent = riskPercent
    }

    return recommendations
  }

  // Reset daily metrics
  resetDaily() {
    this.dailyPnL = 0
    this.logger.info('Daily risk metrics reset')
  }
}

export { RiskManager }
export default RiskManager