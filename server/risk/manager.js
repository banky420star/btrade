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

  // Position sizing using Kelly Criterion
  calculatePositionSize(symbol, entryPrice, stopLoss, winRate, avgWin, avgLoss) {
    if (this.config.emergencyStop) {
      return 0
    }

    // Calculate Kelly fraction
    const kellyFraction = this.calculateKellyFraction(winRate, avgWin, avgLoss)
    const adjustedKelly = Math.min(kellyFraction, this.config.kellyFraction)
    
    // Calculate position size based on risk
    const riskAmount = this.account.equity * this.config.maxPositionSize
    const stopDistance = Math.abs(entryPrice - stopLoss)
    const positionSize = riskAmount / stopDistance
    
    // Apply Kelly sizing
    const kellySize = this.account.equity * adjustedKelly
    const finalSize = Math.min(positionSize, kellySize)
    
    // Ensure we don't exceed maximum position size
    const maxSize = this.account.equity * this.config.maxPositionSize
    const finalPositionSize = Math.min(finalSize, maxSize)
    
    this.logger.debug('Position size calculation', {
      symbol,
      entryPrice,
      stopLoss,
      winRate,
      avgWin,
      avgLoss,
      kellyFraction: adjustedKelly,
      riskAmount,
      positionSize: finalPositionSize
    })
    
    return Math.max(0, finalPositionSize)
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

  // Risk checks before opening position
  canOpenPosition(symbol, side, size, entryPrice) {
    const checks = {
      emergencyStop: !this.config.emergencyStop,
      maxPositions: this.positions.length < this.config.maxPositions,
      dailyLoss: this.dailyPnL > -this.account.equity * this.config.maxDailyLoss,
      drawdown: this.maxDrawdown < this.config.maxDrawdown,
      margin: this.hasEnoughMargin(size, entryPrice),
      correlation: this.checkCorrelation(symbol, side)
    }

    const canOpen = Object.values(checks).every(check => check === true)
    
    if (!canOpen) {
      this.logger.risk('POSITION_BLOCKED', {
        symbol,
        side,
        size,
        entryPrice,
        checks
      })
    }

    return { canOpen, checks }
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