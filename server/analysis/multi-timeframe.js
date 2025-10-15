import { Logger } from '../utils/logger.js'
import { DataManager } from '../data/manager.js'

class MultiTimeframeAnalysis {
  constructor(dataManager) {
    this.dataManager = dataManager
    this.logger = new Logger()
    this.timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
    this.analysisCache = new Map()
  }

  async analyzeSymbol(symbol) {
    try {
      const analysis = {
        symbol,
        timestamp: new Date().toISOString(),
        timeframes: {},
        overallTrend: 'neutral',
        overallStrength: 0,
        signals: [],
        riskLevel: 'medium'
      }

      // Analyze each timeframe
      for (const timeframe of this.timeframes) {
        const tfAnalysis = await this.analyzeTimeframe(symbol, timeframe)
        analysis.timeframes[timeframe] = tfAnalysis
      }

      // Determine overall trend and strength
      analysis.overallTrend = this.determineOverallTrend(analysis.timeframes)
      analysis.overallStrength = this.calculateOverallStrength(analysis.timeframes)
      analysis.signals = this.generateSignals(analysis.timeframes)
      analysis.riskLevel = this.assessRiskLevel(analysis.timeframes)

      this.analysisCache.set(symbol, analysis)
      return analysis

    } catch (error) {
      this.logger.error(`Error analyzing ${symbol}`, { error: error.message })
      throw error
    }
  }

  async analyzeTimeframe(symbol, timeframe) {
    try {
      const data = await this.dataManager.fetchOHLCV(symbol, timeframe, 200)
      const indicators = this.dataManager.calculateIndicators(symbol, timeframe, data)
      
      return {
        timeframe,
        trend: this.analyzeTrend(data, indicators),
        momentum: this.analyzeMomentum(data, indicators),
        volatility: this.analyzeVolatility(data, indicators),
        volume: this.analyzeVolume(data, indicators),
        supportResistance: this.analyzeSupportResistance(data, indicators),
        patterns: this.analyzePatterns(data, indicators),
        signals: this.generateTimeframeSignals(data, indicators),
        strength: this.calculateTimeframeStrength(data, indicators)
      }
    } catch (error) {
      this.logger.error(`Error analyzing ${symbol} ${timeframe}`, { error: error.message })
      return {
        timeframe,
        trend: 'neutral',
        momentum: 0,
        volatility: 0,
        volume: 0,
        supportResistance: { support: 0, resistance: 0 },
        patterns: [],
        signals: [],
        strength: 0
      }
    }
  }

  analyzeTrend(data, indicators) {
    const close = data.map(d => d.close)
    const currentPrice = close[close.length - 1]
    
    // Moving average analysis
    const sma20 = indicators.sma20[indicators.sma20.length - 1] || 0
    const sma50 = indicators.sma50[indicators.sma50.length - 1] || 0
    const sma200 = indicators.sma200[indicators.sma200.length - 1] || 0
    
    const ema12 = indicators.ema12[indicators.ema12.length - 1] || 0
    const ema26 = indicators.ema26[indicators.ema26.length - 1] || 0
    
    // MACD trend
    const macd = indicators.macd[indicators.macd.length - 1]
    const macdLine = macd?.MACD || 0
    const macdSignal = macd?.signal || 0
    
    // ADX trend strength
    const adx = indicators.adx14[indicators.adx14.length - 1] || 0
    
    let trendScore = 0
    
    // Price vs moving averages
    if (currentPrice > sma20) trendScore += 1
    if (sma20 > sma50) trendScore += 1
    if (sma50 > sma200) trendScore += 1
    if (currentPrice > sma200) trendScore += 1
    
    // EMA alignment
    if (currentPrice > ema12) trendScore += 1
    if (ema12 > ema26) trendScore += 1
    
    // MACD confirmation
    if (macdLine > macdSignal) trendScore += 1
    
    // ADX strength
    if (adx > 25) trendScore += 1
    
    if (trendScore >= 6) return 'strong_uptrend'
    if (trendScore >= 4) return 'uptrend'
    if (trendScore <= 2) return 'strong_downtrend'
    if (trendScore <= 4) return 'downtrend'
    return 'sideways'
  }

  analyzeMomentum(data, indicators) {
    const close = data.map(d => d.close)
    const currentPrice = close[close.length - 1]
    const prevPrice = close[close.length - 2]
    
    // RSI momentum
    const rsi14 = indicators.rsi14[indicators.rsi14.length - 1] || 50
    const rsi6 = indicators.rsi6[indicators.rsi6.length - 1] || 50
    
    // Stochastic momentum
    const stochastic = indicators.stochastic14[indicators.stochastic14.length - 1]
    const stochK = stochastic?.k || 50
    const stochD = stochastic?.d || 50
    
    // MACD momentum
    const macd = indicators.macd[indicators.macd.length - 1]
    const macdLine = macd?.MACD || 0
    const macdSignal = macd?.signal || 0
    const macdHistogram = macd?.histogram || 0
    
    // Price momentum
    const priceChange = (currentPrice - prevPrice) / prevPrice
    
    let momentumScore = 0
    
    // RSI momentum
    if (rsi14 > 50) momentumScore += 1
    if (rsi6 > 50) momentumScore += 1
    if (rsi14 > 60) momentumScore += 1
    if (rsi6 > 60) momentumScore += 1
    
    // Stochastic momentum
    if (stochK > 50) momentumScore += 1
    if (stochD > 50) momentumScore += 1
    if (stochK > stochD) momentumScore += 1
    
    // MACD momentum
    if (macdLine > macdSignal) momentumScore += 1
    if (macdHistogram > 0) momentumScore += 1
    
    // Price momentum
    if (priceChange > 0) momentumScore += 1
    
    return momentumScore / 10 // Normalize to 0-1
  }

  analyzeVolatility(data, indicators) {
    const atr14 = indicators.atr14[indicators.atr14.length - 1] || 0
    const atr21 = indicators.atr21[indicators.atr21.length - 1] || 0
    
    // Bollinger Band width
    const bb = indicators.bb20
    const bbWidth = bb[bb.length - 1] ? 
      (bb[bb.length - 1].upper - bb[bb.length - 1].lower) / bb[bb.length - 1].middle : 0
    
    // Volatility calculation
    const volatility10 = indicators.volatility10[indicators.volatility10.length - 1] || 0
    const volatility20 = indicators.volatility20[indicators.volatility20.length - 1] || 0
    
    // Average volatility
    const avgVolatility = (volatility10 + volatility20) / 2
    
    // Volatility expansion
    const volatilityExpansion = atr14 > atr21 ? 1 : 0
    
    // BB width expansion
    const bbExpansion = bbWidth > 0.02 ? 1 : 0
    
    return {
      level: avgVolatility,
      expansion: volatilityExpansion,
      bbExpansion: bbExpansion,
      atr: atr14,
      bbWidth: bbWidth
    }
  }

  analyzeVolume(data, indicators) {
    const volume = data.map(d => d.volume)
    const currentVolume = volume[volume.length - 1]
    
    const volumeSMA10 = indicators.volumeSMA10[indicators.volumeSMA10.length - 1] || 0
    const volumeSMA20 = indicators.volumeSMA20[indicators.volumeSMA20.length - 1] || 0
    
    // OBV analysis
    const obv = indicators.obv[indicators.obv.length - 1] || 0
    const obvRate = indicators.obvRate[indicators.obvRate.length - 1] || 0
    
    // VWAP
    const vwap = indicators.vwap[indicators.vwap.length - 1] || 0
    
    return {
      current: currentVolume,
      avg10: volumeSMA10,
      avg20: volumeSMA20,
      ratio: volumeSMA20 > 0 ? currentVolume / volumeSMA20 : 1,
      obv: obv,
      obvRate: obvRate,
      vwap: vwap,
      spike: currentVolume > volumeSMA20 * 1.5
    }
  }

  analyzeSupportResistance(data, indicators) {
    const high = data.map(d => d.high)
    const low = data.map(d => d.low)
    const close = data.map(d => d.close)
    const currentPrice = close[close.length - 1]
    
    // Pivot points
    const pivotPoints = indicators.pivotPoints[indicators.pivotPoints.length - 1]
    const pivot = pivotPoints?.pivot || 0
    const r1 = pivotPoints?.r1 || 0
    const r2 = pivotPoints?.r2 || 0
    const s1 = pivotPoints?.s1 || 0
    const s2 = pivotPoints?.s2 || 0
    
    // Fibonacci levels
    const fibonacci = indicators.fibonacci[indicators.fibonacci.length - 1]
    const fib236 = fibonacci?.retracement?.level236 || 0
    const fib382 = fibonacci?.retracement?.level382 || 0
    const fib500 = fibonacci?.retracement?.level500 || 0
    const fib618 = fibonacci?.retracement?.level618 || 0
    
    // Recent highs and lows
    const recentHigh = Math.max(...high.slice(-20))
    const recentLow = Math.min(...low.slice(-20))
    
    // Price channels
    const priceChannel = indicators.priceChannel20[indicators.priceChannel20.length - 1]
    const channelUpper = priceChannel?.upper || 0
    const channelLower = priceChannel?.lower || 0
    
    return {
      pivot: pivot,
      resistance: [r1, r2, recentHigh, channelUpper].filter(r => r > currentPrice),
      support: [s1, s2, recentLow, channelLower].filter(s => s < currentPrice),
      fibonacci: {
        level236: fib236,
        level382: fib382,
        level500: fib500,
        level618: fib618
      },
      channel: {
        upper: channelUpper,
        lower: channelLower
      }
    }
  }

  analyzePatterns(data, indicators) {
    const patterns = []
    
    // Candlestick patterns
    if (indicators.doji[indicators.doji.length - 1]) {
      patterns.push({ type: 'doji', significance: 'medium' })
    }
    
    if (indicators.hammer[indicators.hammer.length - 1]) {
      patterns.push({ type: 'hammer', significance: 'high' })
    }
    
    if (indicators.shootingStar[indicators.shootingStar.length - 1]) {
      patterns.push({ type: 'shooting_star', significance: 'high' })
    }
    
    if (indicators.engulfing[indicators.engulfing.length - 1]) {
      patterns.push({ type: 'engulfing', significance: 'high' })
    }
    
    // Chart patterns
    if (indicators.higherHighs[indicators.higherHighs.length - 1]) {
      patterns.push({ type: 'higher_highs', significance: 'medium' })
    }
    
    if (indicators.lowerLows[indicators.lowerLows.length - 1]) {
      patterns.push({ type: 'lower_lows', significance: 'medium' })
    }
    
    const breakouts = indicators.breakouts[indicators.breakouts.length - 1]
    if (breakouts?.bullish) {
      patterns.push({ type: 'bullish_breakout', significance: 'high' })
    }
    
    if (breakouts?.bearish) {
      patterns.push({ type: 'bearish_breakout', significance: 'high' })
    }
    
    return patterns
  }

  generateTimeframeSignals(data, indicators) {
    const signals = []
    const currentPrice = data.close[data.close.length - 1]
    
    // RSI signals
    const rsi14 = indicators.rsi14[indicators.rsi14.length - 1] || 50
    if (rsi14 < 30) {
      signals.push({ type: 'buy', strength: 'strong', reason: 'RSI oversold' })
    } else if (rsi14 > 70) {
      signals.push({ type: 'sell', strength: 'strong', reason: 'RSI overbought' })
    }
    
    // MACD signals
    const macd = indicators.macd[indicators.macd.length - 1]
    const macdLine = macd?.MACD || 0
    const macdSignal = macd?.signal || 0
    if (macdLine > macdSignal) {
      signals.push({ type: 'buy', strength: 'medium', reason: 'MACD bullish' })
    } else if (macdLine < macdSignal) {
      signals.push({ type: 'sell', strength: 'medium', reason: 'MACD bearish' })
    }
    
    // Bollinger Band signals
    const bb = indicators.bb20
    const bbUpper = bb[bb.length - 1]?.upper || 0
    const bbLower = bb[bb.length - 1]?.lower || 0
    if (currentPrice > bbUpper) {
      signals.push({ type: 'sell', strength: 'medium', reason: 'Price above BB upper' })
    } else if (currentPrice < bbLower) {
      signals.push({ type: 'buy', strength: 'medium', reason: 'Price below BB lower' })
    }
    
    return signals
  }

  calculateTimeframeStrength(data, indicators) {
    const trend = this.analyzeTrend(data, indicators)
    const momentum = this.analyzeMomentum(data, indicators)
    const volatility = this.analyzeVolatility(data, indicators)
    const volume = this.analyzeVolume(data, indicators)
    
    let strength = 0
    
    // Trend strength
    if (trend === 'strong_uptrend' || trend === 'strong_downtrend') strength += 0.4
    else if (trend === 'uptrend' || trend === 'downtrend') strength += 0.2
    
    // Momentum strength
    strength += momentum * 0.3
    
    // Volume confirmation
    if (volume.spike) strength += 0.2
    else if (volume.ratio > 1) strength += 0.1
    
    // Volatility (moderate volatility is good)
    if (volatility.level > 0.1 && volatility.level < 0.3) strength += 0.1
    
    return Math.min(strength, 1)
  }

  determineOverallTrend(timeframes) {
    const trends = Object.values(timeframes).map(tf => tf.trend)
    const trendCounts = trends.reduce((acc, trend) => {
      acc[trend] = (acc[trend] || 0) + 1
      return acc
    }, {})
    
    const maxTrend = Object.keys(trendCounts).reduce((a, b) => 
      trendCounts[a] > trendCounts[b] ? a : b
    )
    
    return maxTrend
  }

  calculateOverallStrength(timeframes) {
    const strengths = Object.values(timeframes).map(tf => tf.strength)
    return strengths.reduce((sum, strength) => sum + strength, 0) / strengths.length
  }

  generateSignals(timeframes) {
    const allSignals = []
    
    Object.values(timeframes).forEach(tf => {
      allSignals.push(...tf.signals.map(signal => ({
        ...signal,
        timeframe: tf.timeframe
      })))
    })
    
    // Group signals by type
    const buySignals = allSignals.filter(s => s.type === 'buy')
    const sellSignals = allSignals.filter(s => s.type === 'sell')
    
    return {
      buy: buySignals,
      sell: sellSignals,
      total: allSignals.length
    }
  }

  assessRiskLevel(timeframes) {
    const volatilities = Object.values(timeframes).map(tf => tf.volatility.level)
    const avgVolatility = volatilities.reduce((sum, vol) => sum + vol, 0) / volatilities.length
    
    if (avgVolatility > 0.3) return 'high'
    if (avgVolatility > 0.15) return 'medium'
    return 'low'
  }

  // Get cached analysis
  getCachedAnalysis(symbol) {
    return this.analysisCache.get(symbol)
  }

  // Clear cache
  clearCache() {
    this.analysisCache.clear()
  }
}

export { MultiTimeframeAnalysis }
export default MultiTimeframeAnalysis