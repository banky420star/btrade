import { Logger } from '../utils/logger.js'
import { DataManager } from '../data/manager.js'
import { AdvancedStrategies } from '../strategies/advanced-strategies.js'
import { MultiTimeframeAnalysis } from '../analysis/multi-timeframe.js'

class MarketScanner {
  constructor(dataManager) {
    this.dataManager = dataManager
    this.logger = new Logger()
    this.strategies = new AdvancedStrategies()
    this.multiTimeframe = new MultiTimeframeAnalysis(dataManager)
    
    this.symbols = [
      'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD',
      'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'CAD/JPY', 'CHF/JPY', 'NZD/JPY',
      'EUR/AUD', 'EUR/CAD', 'EUR/CHF', 'EUR/NZD', 'GBP/AUD', 'GBP/CAD', 'GBP/CHF',
      'AUD/CAD', 'AUD/CHF', 'AUD/NZD', 'CAD/CHF', 'CAD/NZD', 'CHF/NZD'
    ]
    
    this.timeframes = ['1m', '5m', '15m', '1h', '4h']
    this.scanResults = new Map()
    this.isScanning = false
    this.scanInterval = null
  }

  async startScanning(intervalMs = 30000) {
    if (this.isScanning) {
      this.logger.warn('Market scanner is already running')
      return
    }

    this.logger.info('Starting market scanner')
    this.isScanning = true

    // Initial scan
    await this.performScan()

    // Set up interval
    this.scanInterval = setInterval(async () => {
      try {
        await this.performScan()
      } catch (error) {
        this.logger.error('Error in market scan', { error: error.message })
      }
    }, intervalMs)
  }

  stopScanning() {
    if (!this.isScanning) {
      this.logger.warn('Market scanner is not running')
      return
    }

    this.logger.info('Stopping market scanner')
    this.isScanning = false

    if (this.scanInterval) {
      clearInterval(this.scanInterval)
      this.scanInterval = null
    }
  }

  async performScan() {
    this.logger.debug('Performing market scan')
    const scanStartTime = Date.now()
    
    const scanPromises = this.symbols.map(symbol => this.scanSymbol(symbol))
    const results = await Promise.allSettled(scanPromises)
    
    const scanResults = {
      timestamp: new Date().toISOString(),
      duration: Date.now() - scanStartTime,
      symbols: [],
      opportunities: [],
      alerts: [],
      summary: {
        totalSymbols: this.symbols.length,
        scannedSymbols: 0,
        opportunitiesFound: 0,
        alertsGenerated: 0
      }
    }

    results.forEach((result, index) => {
      const symbol = this.symbols[index]
      
      if (result.status === 'fulfilled') {
        scanResults.symbols.push(result.value)
        scanResults.summary.scannedSymbols++
        
        if (result.value.opportunities.length > 0) {
          scanResults.opportunities.push(...result.value.opportunities)
          scanResults.summary.opportunitiesFound += result.value.opportunities.length
        }
        
        if (result.value.alerts.length > 0) {
          scanResults.alerts.push(...result.value.alerts)
          scanResults.summary.alertsGenerated += result.value.alerts.length
        }
      } else {
        this.logger.error(`Failed to scan ${symbol}`, { error: result.reason })
      }
    })

    // Sort opportunities by confidence
    scanResults.opportunities.sort((a, b) => b.confidence - a.confidence)
    
    // Store results
    this.scanResults.set('latest', scanResults)
    
    this.logger.info('Market scan completed', {
      duration: scanResults.duration,
      opportunities: scanResults.summary.opportunitiesFound,
      alerts: scanResults.summary.alertsGenerated
    })

    return scanResults
  }

  async scanSymbol(symbol) {
    try {
      const result = {
        symbol,
        timestamp: new Date().toISOString(),
        opportunities: [],
        alerts: [],
        analysis: null,
        riskLevel: 'medium'
      }

      // Multi-timeframe analysis
      const analysis = await this.multiTimeframe.analyzeSymbol(symbol)
      result.analysis = analysis
      result.riskLevel = analysis.riskLevel

      // Scan for opportunities
      const opportunities = await this.findOpportunities(symbol, analysis)
      result.opportunities = opportunities

      // Generate alerts
      const alerts = await this.generateAlerts(symbol, analysis)
      result.alerts = alerts

      return result

    } catch (error) {
      this.logger.error(`Error scanning ${symbol}`, { error: error.message })
      return {
        symbol,
        timestamp: new Date().toISOString(),
        opportunities: [],
        alerts: [],
        analysis: null,
        riskLevel: 'high',
        error: error.message
      }
    }
  }

  async findOpportunities(symbol, analysis) {
    const opportunities = []

    try {
      // Get latest data for strategy execution
      const data = await this.dataManager.fetchOHLCV(symbol, '5m', 100)
      const indicators = this.dataManager.calculateIndicators(symbol, '5m', data)

      // Execute all strategies
      const strategyNames = this.strategies.getAvailableStrategies()
      
      for (const strategyName of strategyNames) {
        const signals = this.strategies.executeStrategy(strategyName, data, indicators)
        
        signals.forEach(signal => {
          if (signal.confidence > 0.6) { // Only high-confidence signals
            opportunities.push({
              symbol,
              strategy: strategyName,
              type: signal.type,
              confidence: signal.confidence,
              reason: signal.reason,
              stopLoss: signal.stopLoss,
              takeProfit: signal.takeProfit,
              timeframe: '5m',
              timestamp: new Date().toISOString(),
              riskLevel: this.assessOpportunityRisk(signal, analysis)
            })
          }
        })
      }

      // Multi-timeframe opportunities
      const mtfOpportunities = this.findMultiTimeframeOpportunities(symbol, analysis)
      opportunities.push(...mtfOpportunities)

      // Volatility opportunities
      const volOpportunities = this.findVolatilityOpportunities(symbol, analysis)
      opportunities.push(...volOpportunities)

      // News sentiment opportunities
      const newsOpportunities = this.findNewsOpportunities(symbol, analysis)
      opportunities.push(...newsOpportunities)

    } catch (error) {
      this.logger.error(`Error finding opportunities for ${symbol}`, { error: error.message })
    }

    return opportunities
  }

  findMultiTimeframeOpportunities(symbol, analysis) {
    const opportunities = []
    const { timeframes, overallTrend, overallStrength } = analysis

    // Strong trend alignment across timeframes
    if (overallStrength > 0.7) {
      if (overallTrend === 'strong_uptrend') {
        opportunities.push({
          symbol,
          strategy: 'multi_timeframe_trend',
          type: 'buy',
          confidence: overallStrength,
          reason: 'Strong uptrend across all timeframes',
          timeframe: 'multi',
          timestamp: new Date().toISOString(),
          riskLevel: 'low'
        })
      } else if (overallTrend === 'strong_downtrend') {
        opportunities.push({
          symbol,
          strategy: 'multi_timeframe_trend',
          type: 'sell',
          confidence: overallStrength,
          reason: 'Strong downtrend across all timeframes',
          timeframe: 'multi',
          timestamp: new Date().toISOString(),
          riskLevel: 'low'
        })
      }
    }

    // Divergence opportunities
    const divergenceOpps = this.findDivergenceOpportunities(symbol, timeframes)
    opportunities.push(...divergenceOpps)

    return opportunities
  }

  findDivergenceOpportunities(symbol, timeframes) {
    const opportunities = []
    
    // Look for divergences between timeframes
    const shortTerm = timeframes['5m']
    const mediumTerm = timeframes['1h']
    const longTerm = timeframes['4h']

    if (shortTerm && mediumTerm && longTerm) {
      // Bullish divergence: short-term bullish, medium-term bearish, long-term bullish
      if (shortTerm.trend === 'uptrend' && 
          mediumTerm.trend === 'downtrend' && 
          longTerm.trend === 'uptrend') {
        opportunities.push({
          symbol,
          strategy: 'divergence',
          type: 'buy',
          confidence: 0.7,
          reason: 'Bullish divergence detected',
          timeframe: 'multi',
          timestamp: new Date().toISOString(),
          riskLevel: 'medium'
        })
      }

      // Bearish divergence: short-term bearish, medium-term bullish, long-term bearish
      if (shortTerm.trend === 'downtrend' && 
          mediumTerm.trend === 'uptrend' && 
          longTerm.trend === 'downtrend') {
        opportunities.push({
          symbol,
          strategy: 'divergence',
          type: 'sell',
          confidence: 0.7,
          reason: 'Bearish divergence detected',
          timeframe: 'multi',
          timestamp: new Date().toISOString(),
          riskLevel: 'medium'
        })
      }
    }

    return opportunities
  }

  findVolatilityOpportunities(symbol, analysis) {
    const opportunities = []
    const { timeframes } = analysis

    // Check for volatility expansion
    Object.entries(timeframes).forEach(([tf, data]) => {
      if (data.volatility && data.volatility.expansion && data.volatility.bbExpansion) {
        opportunities.push({
          symbol,
          strategy: 'volatility_expansion',
          type: 'buy', // Volatility expansion often leads to breakouts
          confidence: 0.6,
          reason: `Volatility expansion detected on ${tf}`,
          timeframe: tf,
          timestamp: new Date().toISOString(),
          riskLevel: 'high'
        })
      }
    })

    return opportunities
  }

  findNewsOpportunities(symbol, analysis) {
    const opportunities = []
    
    // This would integrate with news sentiment analysis
    // For now, we'll use placeholder logic based on volatility and volume
    
    const { timeframes } = analysis
    const shortTerm = timeframes['1m'] || timeframes['5m']
    
    if (shortTerm && shortTerm.volume && shortTerm.volume.spike) {
      // High volume spike could indicate news reaction
      opportunities.push({
        symbol,
        strategy: 'news_sentiment',
        type: 'buy', // Placeholder - would be determined by sentiment
        confidence: 0.5,
        reason: 'High volume spike detected - possible news reaction',
        timeframe: '1m',
        timestamp: new Date().toISOString(),
        riskLevel: 'high'
      })
    }

    return opportunities
  }

  async generateAlerts(symbol, analysis) {
    const alerts = []
    const { timeframes, overallTrend, overallStrength, riskLevel } = analysis

    // High volatility alert
    Object.entries(timeframes).forEach(([tf, data]) => {
      if (data.volatility && data.volatility.level > 0.3) {
        alerts.push({
          symbol,
          type: 'high_volatility',
          severity: 'warning',
          message: `High volatility detected on ${tf}`,
          timeframe: tf,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Volume spike alert
    Object.entries(timeframes).forEach(([tf, data]) => {
      if (data.volume && data.volume.spike) {
        alerts.push({
          symbol,
          type: 'volume_spike',
          severity: 'info',
          message: `Volume spike detected on ${tf}`,
          timeframe: tf,
          timestamp: new Date().toISOString()
        })
      }
    })

    // Strong trend alert
    if (overallStrength > 0.8) {
      alerts.push({
        symbol,
        type: 'strong_trend',
        severity: 'info',
        message: `Strong ${overallTrend} detected`,
        timeframe: 'multi',
        timestamp: new Date().toISOString()
      })
    }

    // Risk level alert
    if (riskLevel === 'high') {
      alerts.push({
        symbol,
        type: 'high_risk',
        severity: 'warning',
        message: 'High risk level detected',
        timeframe: 'multi',
        timestamp: new Date().toISOString()
      })
    }

    return alerts
  }

  assessOpportunityRisk(signal, analysis) {
    let riskLevel = 'medium'

    // High confidence signals are lower risk
    if (signal.confidence > 0.8) {
      riskLevel = 'low'
    } else if (signal.confidence < 0.5) {
      riskLevel = 'high'
    }

    // High volatility increases risk
    if (analysis.riskLevel === 'high') {
      riskLevel = 'high'
    }

    // Strong trends reduce risk
    if (analysis.overallTrend === 'strong_uptrend' || analysis.overallTrend === 'strong_downtrend') {
      if (riskLevel === 'high') riskLevel = 'medium'
      if (riskLevel === 'medium') riskLevel = 'low'
    }

    return riskLevel
  }

  // Get latest scan results
  getLatestResults() {
    return this.scanResults.get('latest')
  }

  // Get opportunities for a specific symbol
  getSymbolOpportunities(symbol) {
    const latest = this.getLatestResults()
    if (!latest) return []
    
    return latest.opportunities.filter(opp => opp.symbol === symbol)
  }

  // Get all high-confidence opportunities
  getHighConfidenceOpportunities(minConfidence = 0.7) {
    const latest = this.getLatestResults()
    if (!latest) return []
    
    return latest.opportunities.filter(opp => opp.confidence >= minConfidence)
  }

  // Get alerts by severity
  getAlertsBySeverity(severity) {
    const latest = this.getLatestResults()
    if (!latest) return []
    
    return latest.alerts.filter(alert => alert.severity === severity)
  }

  // Get scanner status
  getStatus() {
    return {
      isScanning: this.isScanning,
      symbolsCount: this.symbols.length,
      timeframes: this.timeframes,
      lastScan: this.scanResults.get('latest')?.timestamp || null
    }
  }
}

export { MarketScanner }
export default MarketScanner