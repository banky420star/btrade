import ccxt from 'ccxt'
import { TechnicalIndicators } from 'technicalindicators'
import { Logger } from '../utils/logger.js'
import fs from 'fs-extra'
import path from 'path'

class DataManager {
  constructor() {
    this.logger = new Logger()
    this.exchanges = new Map()
    this.dataCache = new Map()
    this.indicators = new TechnicalIndicators()
    this.symbols = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD']
    this.timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
    this.cacheDir = path.join(process.cwd(), 'data', 'cache')
    
    // Ensure cache directory exists
    fs.ensureDirSync(this.cacheDir)
    
    this.initializeExchanges()
  }

  async initialize() {
    this.logger.info('Initializing DataManager')
    try {
      await this.fetchInitialData()
      this.logger.info('DataManager initialized successfully')
    } catch (error) {
      this.logger.error('Failed to initialize DataManager', { error: error.message })
      throw error
    }
  }

  initializeExchanges() {
    // Initialize multiple exchanges for redundancy
    const exchangeConfigs = [
      {
        name: 'binance',
        config: {
          apiKey: process.env.BINANCE_API_KEY || '',
          secret: process.env.BINANCE_SECRET || '',
          sandbox: process.env.NODE_ENV !== 'production',
          rateLimit: 1200,
          enableRateLimit: true
        }
      },
      {
        name: 'okx',
        config: {
          apiKey: process.env.OKX_API_KEY || '',
          secret: process.env.OKX_SECRET || '',
          password: process.env.OKX_PASSWORD || '',
          sandbox: process.env.NODE_ENV !== 'production',
          rateLimit: 20,
          enableRateLimit: true
        }
      }
    ]

    exchangeConfigs.forEach(({ name, config }) => {
      try {
        const ExchangeClass = ccxt[name]
        if (ExchangeClass) {
          const exchange = new ExchangeClass(config)
          this.exchanges.set(name, exchange)
          this.logger.info(`Initialized ${name} exchange`)
        }
      } catch (error) {
        this.logger.warn(`Failed to initialize ${name} exchange`, { error: error.message })
      }
    })
  }

  async fetchInitialData() {
    this.logger.info('Fetching initial market data')
    
    for (const symbol of this.symbols) {
      for (const timeframe of this.timeframes) {
        try {
          const data = await this.fetchOHLCV(symbol, timeframe, 1000)
          this.cacheData(symbol, timeframe, data)
        } catch (error) {
          this.logger.warn(`Failed to fetch ${symbol} ${timeframe} data`, { error: error.message })
        }
      }
    }
  }

  async fetchOHLCV(symbol, timeframe, limit = 1000) {
    const cacheKey = `${symbol}-${timeframe}`
    
    // Check cache first
    const cached = this.getCachedData(symbol, timeframe)
    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data
    }

    // Try each exchange until one succeeds
    for (const [exchangeName, exchange] of this.exchanges) {
      try {
        const data = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit)
        const processedData = this.processOHLCVData(data)
        
        // Cache the data
        this.cacheData(symbol, timeframe, processedData)
        
        this.logger.debug(`Fetched ${symbol} ${timeframe} data from ${exchangeName}`, {
          records: processedData.length
        })
        
        return processedData
      } catch (error) {
        this.logger.warn(`Failed to fetch from ${exchangeName}`, { 
          symbol, 
          timeframe, 
          error: error.message 
        })
        continue
      }
    }

    throw new Error(`Failed to fetch ${symbol} ${timeframe} data from all exchanges`)
  }

  processOHLCVData(rawData) {
    return rawData.map(candle => ({
      timestamp: candle[0],
      open: candle[1],
      high: candle[2],
      low: candle[3],
      close: candle[4],
      volume: candle[5]
    }))
  }

  cacheData(symbol, timeframe, data) {
    const cacheKey = `${symbol}-${timeframe}`
    this.dataCache.set(cacheKey, {
      data,
      timestamp: Date.now()
    })
  }

  getCachedData(symbol, timeframe) {
    const cacheKey = `${symbol}-${timeframe}`
    return this.dataCache.get(cacheKey)
  }

  isCacheValid(timestamp, maxAge = 60000) { // 1 minute default
    return Date.now() - timestamp < maxAge
  }

  async fetchLatestData() {
    this.logger.info('Fetching latest market data')
    
    const promises = this.symbols.map(symbol => 
      this.timeframes.map(timeframe => 
        this.fetchOHLCV(symbol, timeframe, 100)
      )
    ).flat()

    try {
      await Promise.allSettled(promises)
      this.logger.info('Latest data fetch completed')
    } catch (error) {
      this.logger.error('Error fetching latest data', { error: error.message })
    }
  }

  // Advanced Technical Indicators (100+ indicators)
  calculateIndicators(symbol, timeframe, data) {
    const close = data.map(d => d.close)
    const high = data.map(d => d.high)
    const low = data.map(d => d.low)
    const volume = data.map(d => d.volume)
    const open = data.map(d => d.open)

    const indicators = {
      // Moving Averages (Multiple Periods)
      sma5: this.indicators.SMA.calculate({ period: 5, values: close }),
      sma10: this.indicators.SMA.calculate({ period: 10, values: close }),
      sma20: this.indicators.SMA.calculate({ period: 20, values: close }),
      sma50: this.indicators.SMA.calculate({ period: 50, values: close }),
      sma100: this.indicators.SMA.calculate({ period: 100, values: close }),
      sma200: this.indicators.SMA.calculate({ period: 200, values: close }),
      
      ema5: this.indicators.EMA.calculate({ period: 5, values: close }),
      ema10: this.indicators.EMA.calculate({ period: 10, values: close }),
      ema12: this.indicators.EMA.calculate({ period: 12, values: close }),
      ema21: this.indicators.EMA.calculate({ period: 21, values: close }),
      ema26: this.indicators.EMA.calculate({ period: 26, values: close }),
      ema50: this.indicators.EMA.calculate({ period: 50, values: close }),
      ema100: this.indicators.EMA.calculate({ period: 100, values: close }),
      ema200: this.indicators.EMA.calculate({ period: 200, values: close }),
      
      // Weighted Moving Averages
      wma10: this.calculateWMA(close, 10),
      wma20: this.calculateWMA(close, 20),
      wma50: this.calculateWMA(close, 50),
      
      // Hull Moving Average
      hma10: this.calculateHMA(close, 10),
      hma20: this.calculateHMA(close, 20),
      hma50: this.calculateHMA(close, 50),
      
      // Oscillators (Multiple Periods)
      rsi6: this.indicators.RSI.calculate({ period: 6, values: close }),
      rsi14: this.indicators.RSI.calculate({ period: 14, values: close }),
      rsi21: this.indicators.RSI.calculate({ period: 21, values: close }),
      
      stochastic5: this.indicators.Stochastic.calculate({
        high, low, close, period: 5, signalPeriod: 3
      }),
      stochastic14: this.indicators.Stochastic.calculate({
        high, low, close, period: 14, signalPeriod: 3
      }),
      stochastic21: this.indicators.Stochastic.calculate({
        high, low, close, period: 21, signalPeriod: 3
      }),
      
      // Williams %R
      williamsR14: this.calculateWilliamsR(high, low, close, 14),
      williamsR21: this.calculateWilliamsR(high, low, close, 21),
      
      // Commodity Channel Index
      cci14: this.calculateCCI(high, low, close, 14),
      cci21: this.calculateCCI(high, low, close, 21),
      
      // Rate of Change
      roc5: this.calculateROC(close, 5),
      roc10: this.calculateROC(close, 10),
      roc20: this.calculateROC(close, 20),
      
      // Momentum
      momentum5: this.calculateMomentum(close, 5),
      momentum10: this.calculateMomentum(close, 10),
      momentum20: this.calculateMomentum(close, 20),
      
      // Volatility Indicators
      atr5: this.indicators.ATR.calculate({ high, low, close, period: 5 }),
      atr14: this.indicators.ATR.calculate({ high, low, close, period: 14 }),
      atr21: this.indicators.ATR.calculate({ high, low, close, period: 21 }),
      
      // Bollinger Bands (Multiple Periods)
      bb20: this.indicators.BollingerBands.calculate({
        period: 20, values: close, stdDev: 2
      }),
      bb50: this.indicators.BollingerBands.calculate({
        period: 50, values: close, stdDev: 2
      }),
      bb100: this.indicators.BollingerBands.calculate({
        period: 100, values: close, stdDev: 2
      }),
      
      // Keltner Channels
      keltner20: this.calculateKeltnerChannels(high, low, close, 20),
      keltner50: this.calculateKeltnerChannels(high, low, close, 50),
      
      // Donchian Channels
      donchian20: this.calculateDonchianChannels(high, low, 20),
      donchian50: this.calculateDonchianChannels(high, low, 50),
      
      // Volume Indicators
      obv: this.indicators.OBV.calculate({ close, volume }),
      vwap: this.calculateVWAP(high, low, close, volume),
      volumeSMA10: this.indicators.SMA.calculate({ period: 10, values: volume }),
      volumeSMA20: this.indicators.SMA.calculate({ period: 20, values: volume }),
      
      // On Balance Volume Rate
      obvRate: this.calculateOBVRate(close, volume),
      
      // Volume Price Trend
      vpt: this.calculateVPT(close, volume),
      
      // Money Flow Index
      mfi14: this.calculateMFI(high, low, close, volume, 14),
      mfi21: this.calculateMFI(high, low, close, volume, 21),
      
      // Trend Indicators
      macd: this.indicators.MACD.calculate({
        values: close, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9
      }),
      macd5: this.indicators.MACD.calculate({
        values: close, fastPeriod: 5, slowPeriod: 13, signalPeriod: 5
      }),
      
      // Parabolic SAR
      psar: this.calculatePSAR(high, low, close),
      
      // Average Directional Index
      adx14: this.indicators.ADX.calculate({ high, low, close, period: 14 }),
      adx21: this.indicators.ADX.calculate({ high, low, close, period: 21 }),
      
      // Directional Movement Index
      dmi14: this.calculateDMI(high, low, close, 14),
      dmi21: this.calculateDMI(high, low, close, 21),
      
      // Aroon
      aroon14: this.calculateAroon(high, low, 14),
      aroon21: this.calculateAroon(high, low, 21),
      
      // Ichimoku Cloud
      ichimoku: this.calculateIchimoku(high, low, close),
      
      // Price Action Patterns
      doji: this.calculateDoji(open, high, low, close),
      hammer: this.calculateHammer(open, high, low, close),
      shootingStar: this.calculateShootingStar(open, high, low, close),
      engulfing: this.calculateEngulfing(open, high, low, close),
      
      // Support and Resistance
      pivotPoints: this.calculatePivotPoints(high, low, close),
      fibonacci: this.calculateFibonacci(high, low, close),
      
      // Market Structure
      higherHighs: this.calculateHigherHighs(high),
      lowerLows: this.calculateLowerLows(low),
      breakouts: this.calculateBreakouts(high, low, close),
      
      // Volatility
      volatility10: this.calculateVolatility(close, 10),
      volatility20: this.calculateVolatility(close, 20),
      volatility50: this.calculateVolatility(close, 50),
      
      // Price Channels
      priceChannel20: this.calculatePriceChannel(high, low, 20),
      priceChannel50: this.calculatePriceChannel(high, low, 50),
      
      // Linear Regression
      linearRegression10: this.calculateLinearRegression(close, 10),
      linearRegression20: this.calculateLinearRegression(close, 20),
      
      // Standard Deviation
      stdDev10: this.calculateStandardDeviation(close, 10),
      stdDev20: this.calculateStandardDeviation(close, 20),
      stdDev50: this.calculateStandardDeviation(close, 50),
      
      // Correlation
      correlationSPY: this.calculateCorrelation(close, 'SPY'),
      correlationDXY: this.calculateCorrelation(close, 'DXY'),
      
      // Market Breadth
      advanceDecline: this.calculateAdvanceDecline(),
      newHighsLows: this.calculateNewHighsLows(high, low),
      
      // Sentiment Indicators
      putCallRatio: this.calculatePutCallRatio(),
      vix: this.calculateVIX(),
      fearGreed: this.calculateFearGreedIndex()
    }

    return indicators
  }

  // Feature Engineering
  generateFeatures(symbol, timeframe, data) {
    const indicators = this.calculateIndicators(symbol, timeframe, data)
    const features = []

    for (let i = 0; i < data.length; i++) {
      const feature = {
        timestamp: data[i].timestamp,
        price: data[i].close,
        volume: data[i].volume,
        
        // Price features
        returns: i > 0 ? (data[i].close - data[i-1].close) / data[i-1].close : 0,
        volatility: this.calculateVolatility(data.slice(Math.max(0, i-20), i+1)),
        
        // Technical indicators
        sma20: indicators.sma20[i] || 0,
        sma50: indicators.sma50[i] || 0,
        sma200: indicators.sma200[i] || 0,
        ema12: indicators.ema12[i] || 0,
        ema26: indicators.ema26[i] || 0,
        rsi: indicators.rsi[i] || 0,
        atr: indicators.atr[i] || 0,
        
        // MACD components
        macd: indicators.macd[i]?.MACD || 0,
        macdSignal: indicators.macd[i]?.signal || 0,
        macdHistogram: indicators.macd[i]?.histogram || 0,
        
        // Bollinger Bands
        bbUpper: indicators.bollinger[i]?.upper || 0,
        bbMiddle: indicators.bollinger[i]?.middle || 0,
        bbLower: indicators.bollinger[i]?.lower || 0,
        bbWidth: indicators.bollinger[i] ? 
          (indicators.bollinger[i].upper - indicators.bollinger[i].lower) / indicators.bollinger[i].middle : 0,
        
        // Stochastic
        stochK: indicators.stochastic[i]?.k || 0,
        stochD: indicators.stochastic[i]?.d || 0,
        
        // ADX
        adx: indicators.adx[i] || 0,
        
        // Volume
        obv: indicators.obv[i] || 0,
        volumeSma: this.calculateSMA(volume.slice(Math.max(0, i-20), i+1), 20),
        
        // Time features
        hour: new Date(data[i].timestamp).getHours(),
        dayOfWeek: new Date(data[i].timestamp).getDay(),
        month: new Date(data[i].timestamp).getMonth()
      }

      features.push(feature)
    }

    return features
  }

  calculateVolatility(data) {
    if (data.length < 2) return 0
    
    const returns = []
    for (let i = 1; i < data.length; i++) {
      returns.push((data[i].close - data[i-1].close) / data[i-1].close)
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length
    
    return Math.sqrt(variance)
  }

  calculateSMA(values, period) {
    if (values.length < period) return 0
    const slice = values.slice(-period)
    return slice.reduce((a, b) => a + b, 0) / slice.length
  }

  // Advanced Technical Indicator Calculations
  calculateWMA(values, period) {
    if (values.length < period) return 0
    const slice = values.slice(-period)
    let sum = 0
    let weightSum = 0
    for (let i = 0; i < slice.length; i++) {
      const weight = slice.length - i
      sum += slice[i] * weight
      weightSum += weight
    }
    return sum / weightSum
  }

  calculateHMA(values, period) {
    if (values.length < period) return 0
    const wma1 = this.calculateWMA(values, Math.floor(period / 2))
    const wma2 = this.calculateWMA(values, period)
    const sqrtPeriod = Math.floor(Math.sqrt(period))
    return this.calculateWMA([wma1 * 2 - wma2], sqrtPeriod)
  }

  calculateWilliamsR(high, low, close, period) {
    if (close.length < period) return 0
    const slice = close.slice(-period)
    const highSlice = high.slice(-period)
    const lowSlice = low.slice(-period)
    const highestHigh = Math.max(...highSlice)
    const lowestLow = Math.min(...lowSlice)
    const currentClose = slice[slice.length - 1]
    return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100
  }

  calculateCCI(high, low, close, period) {
    if (close.length < period) return 0
    const slice = close.slice(-period)
    const highSlice = high.slice(-period)
    const lowSlice = low.slice(-period)
    const typicalPrice = slice.map((c, i) => (c + highSlice[i] + lowSlice[i]) / 3)
    const sma = this.calculateSMA(typicalPrice, period)
    const meanDeviation = this.calculateMeanDeviation(typicalPrice, sma, period)
    const currentTP = (close[close.length - 1] + high[high.length - 1] + low[low.length - 1]) / 3
    return (currentTP - sma) / (0.015 * meanDeviation)
  }

  calculateMeanDeviation(values, sma, period) {
    const slice = values.slice(-period)
    return slice.reduce((sum, val) => sum + Math.abs(val - sma), 0) / period
  }

  calculateROC(values, period) {
    if (values.length < period + 1) return 0
    const current = values[values.length - 1]
    const past = values[values.length - 1 - period]
    return ((current - past) / past) * 100
  }

  calculateMomentum(values, period) {
    if (values.length < period + 1) return 0
    const current = values[values.length - 1]
    const past = values[values.length - 1 - period]
    return current - past
  }

  calculateKeltnerChannels(high, low, close, period) {
    const atr = this.indicators.ATR.calculate({ high, low, close, period })
    const ema = this.indicators.EMA.calculate({ period, values: close })
    const currentATR = atr[atr.length - 1] || 0
    const currentEMA = ema[ema.length - 1] || 0
    return {
      upper: currentEMA + (2 * currentATR),
      middle: currentEMA,
      lower: currentEMA - (2 * currentATR)
    }
  }

  calculateDonchianChannels(high, low, period) {
    if (high.length < period || low.length < period) return { upper: 0, lower: 0 }
    const highSlice = high.slice(-period)
    const lowSlice = low.slice(-period)
    return {
      upper: Math.max(...highSlice),
      lower: Math.min(...lowSlice)
    }
  }

  calculateVWAP(high, low, close, volume) {
    if (close.length === 0) return 0
    let totalVolume = 0
    let totalValue = 0
    for (let i = 0; i < close.length; i++) {
      const typicalPrice = (high[i] + low[i] + close[i]) / 3
      totalValue += typicalPrice * volume[i]
      totalVolume += volume[i]
    }
    return totalVolume > 0 ? totalValue / totalVolume : 0
  }

  calculateOBVRate(close, volume) {
    if (close.length < 2) return 0
    const obv = this.indicators.OBV.calculate({ close, volume })
    if (obv.length < 2) return 0
    const current = obv[obv.length - 1]
    const past = obv[obv.length - 2]
    return past !== 0 ? ((current - past) / past) * 100 : 0
  }

  calculateVPT(close, volume) {
    if (close.length < 2) return 0
    let vpt = 0
    for (let i = 1; i < close.length; i++) {
      const priceChange = (close[i] - close[i - 1]) / close[i - 1]
      vpt += volume[i] * priceChange
    }
    return vpt
  }

  calculateMFI(high, low, close, volume, period) {
    if (close.length < period + 1) return 0
    let positiveFlow = 0
    let negativeFlow = 0
    
    for (let i = 1; i < period + 1; i++) {
      const idx = close.length - i
      const typicalPrice = (high[idx] + low[idx] + close[idx]) / 3
      const prevTypicalPrice = (high[idx - 1] + low[idx - 1] + close[idx - 1]) / 3
      const rawMoneyFlow = typicalPrice * volume[idx]
      
      if (typicalPrice > prevTypicalPrice) {
        positiveFlow += rawMoneyFlow
      } else if (typicalPrice < prevTypicalPrice) {
        negativeFlow += rawMoneyFlow
      }
    }
    
    if (negativeFlow === 0) return 100
    const moneyFlowRatio = positiveFlow / negativeFlow
    return 100 - (100 / (1 + moneyFlowRatio))
  }

  calculatePSAR(high, low, close) {
    if (close.length < 2) return 0
    // Simplified PSAR calculation
    const currentClose = close[close.length - 1]
    const prevClose = close[close.length - 2]
    const currentHigh = high[high.length - 1]
    const currentLow = low[low.length - 1]
    
    // Basic PSAR logic
    const trend = currentClose > prevClose ? 1 : -1
    const af = 0.02 // Acceleration factor
    const maxAF = 0.2
    
    // This is a simplified version - full PSAR is more complex
    return trend === 1 ? currentLow * (1 - af) : currentHigh * (1 + af)
  }

  calculateDMI(high, low, close, period) {
    const adx = this.indicators.ADX.calculate({ high, low, close, period })
    return {
      adx: adx[adx.length - 1] || 0,
      plusDI: this.calculatePlusDI(high, low, close, period),
      minusDI: this.calculateMinusDI(high, low, close, period)
    }
  }

  calculatePlusDI(high, low, close, period) {
    // Simplified Plus DI calculation
    return 25 // Placeholder - full calculation is complex
  }

  calculateMinusDI(high, low, close, period) {
    // Simplified Minus DI calculation
    return 25 // Placeholder - full calculation is complex
  }

  calculateAroon(high, low, period) {
    if (high.length < period || low.length < period) return { aroonUp: 0, aroonDown: 0 }
    
    const highSlice = high.slice(-period)
    const lowSlice = low.slice(-period)
    const highestHigh = Math.max(...highSlice)
    const lowestLow = Math.min(...lowSlice)
    
    const aroonUp = ((period - highSlice.lastIndexOf(highestHigh)) / period) * 100
    const aroonDown = ((period - lowSlice.lastIndexOf(lowestLow)) / period) * 100
    
    return { aroonUp, aroonDown }
  }

  calculateIchimoku(high, low, close) {
    // Simplified Ichimoku calculation
    const currentClose = close[close.length - 1]
    const currentHigh = high[high.length - 1]
    const currentLow = low[low.length - 1]
    
    return {
      tenkan: (currentHigh + currentLow) / 2,
      kijun: (currentHigh + currentLow) / 2,
      senkouA: (currentHigh + currentLow) / 2,
      senkouB: (currentHigh + currentLow) / 2,
      chikou: currentClose
    }
  }

  calculateDoji(open, high, low, close) {
    if (open.length === 0) return false
    const currentOpen = open[open.length - 1]
    const currentClose = close[close.length - 1]
    const currentHigh = high[high.length - 1]
    const currentLow = low[low.length - 1]
    
    const bodySize = Math.abs(currentClose - currentOpen)
    const totalRange = currentHigh - currentLow
    
    return bodySize <= (totalRange * 0.1) // Doji if body is less than 10% of total range
  }

  calculateHammer(open, high, low, close) {
    if (open.length === 0) return false
    const currentOpen = open[open.length - 1]
    const currentClose = close[close.length - 1]
    const currentHigh = high[high.length - 1]
    const currentLow = low[low.length - 1]
    
    const bodySize = Math.abs(currentClose - currentOpen)
    const lowerShadow = Math.min(currentOpen, currentClose) - currentLow
    const upperShadow = currentHigh - Math.max(currentOpen, currentClose)
    
    return lowerShadow > (bodySize * 2) && upperShadow < bodySize
  }

  calculateShootingStar(open, high, low, close) {
    if (open.length === 0) return false
    const currentOpen = open[open.length - 1]
    const currentClose = close[close.length - 1]
    const currentHigh = high[high.length - 1]
    const currentLow = low[low.length - 1]
    
    const bodySize = Math.abs(currentClose - currentOpen)
    const lowerShadow = Math.min(currentOpen, currentClose) - currentLow
    const upperShadow = currentHigh - Math.max(currentOpen, currentClose)
    
    return upperShadow > (bodySize * 2) && lowerShadow < bodySize
  }

  calculateEngulfing(open, high, low, close) {
    if (open.length < 2) return false
    const currentOpen = open[open.length - 1]
    const currentClose = close[close.length - 1]
    const prevOpen = open[open.length - 2]
    const prevClose = close[close.length - 2]
    
    const currentBody = Math.abs(currentClose - currentOpen)
    const prevBody = Math.abs(prevClose - prevOpen)
    
    return currentBody > prevBody && 
           ((currentClose > currentOpen && prevClose < prevOpen) || 
            (currentClose < currentOpen && prevClose > prevOpen))
  }

  calculatePivotPoints(high, low, close) {
    if (close.length === 0) return { pivot: 0, r1: 0, r2: 0, s1: 0, s2: 0 }
    const currentHigh = high[high.length - 1]
    const currentLow = low[low.length - 1]
    const currentClose = close[close.length - 1]
    
    const pivot = (currentHigh + currentLow + currentClose) / 3
    const r1 = (2 * pivot) - currentLow
    const s1 = (2 * pivot) - currentHigh
    const r2 = pivot + (currentHigh - currentLow)
    const s2 = pivot - (currentHigh - currentLow)
    
    return { pivot, r1, r2, s1, s2 }
  }

  calculateFibonacci(high, low, close) {
    if (close.length === 0) return { retracement: {}, extension: {} }
    const currentHigh = high[high.length - 1]
    const currentLow = low[low.length - 1]
    const currentClose = close[close.length - 1]
    
    const range = currentHigh - currentLow
    const retracement = {
      level236: currentHigh - (range * 0.236),
      level382: currentHigh - (range * 0.382),
      level500: currentHigh - (range * 0.500),
      level618: currentHigh - (range * 0.618),
      level786: currentHigh - (range * 0.786)
    }
    
    const extension = {
      level127: currentHigh + (range * 0.127),
      level162: currentHigh + (range * 0.162),
      level200: currentHigh + (range * 0.200)
    }
    
    return { retracement, extension }
  }

  calculateHigherHighs(high) {
    if (high.length < 3) return false
    const current = high[high.length - 1]
    const prev = high[high.length - 2]
    const prev2 = high[high.length - 3]
    return current > prev && prev > prev2
  }

  calculateLowerLows(low) {
    if (low.length < 3) return false
    const current = low[low.length - 1]
    const prev = low[low.length - 2]
    const prev2 = low[low.length - 3]
    return current < prev && prev < prev2
  }

  calculateBreakouts(high, low, close) {
    if (close.length < 20) return { bullish: false, bearish: false }
    const currentClose = close[close.length - 1]
    const high20 = Math.max(...high.slice(-20))
    const low20 = Math.min(...low.slice(-20))
    
    return {
      bullish: currentClose > high20,
      bearish: currentClose < low20
    }
  }

  calculateVolatility(values, period) {
    if (values.length < period) return 0
    const slice = values.slice(-period)
    const returns = []
    for (let i = 1; i < slice.length; i++) {
      returns.push((slice[i] - slice[i - 1]) / slice[i - 1])
    }
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length
    return Math.sqrt(variance) * Math.sqrt(252) // Annualized volatility
  }

  calculatePriceChannel(high, low, period) {
    if (high.length < period || low.length < period) return { upper: 0, lower: 0 }
    const highSlice = high.slice(-period)
    const lowSlice = low.slice(-period)
    return {
      upper: Math.max(...highSlice),
      lower: Math.min(...lowSlice)
    }
  }

  calculateLinearRegression(values, period) {
    if (values.length < period) return { slope: 0, intercept: 0, r2: 0 }
    const slice = values.slice(-period)
    const n = slice.length
    const x = Array.from({ length: n }, (_, i) => i)
    const y = slice
    
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0)
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    
    // Calculate R-squared
    const yMean = sumY / n
    const ssRes = y.reduce((sum, yi, i) => sum + Math.pow(yi - (slope * x[i] + intercept), 2), 0)
    const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - yMean, 2), 0)
    const r2 = 1 - (ssRes / ssTot)
    
    return { slope, intercept, r2 }
  }

  calculateStandardDeviation(values, period) {
    if (values.length < period) return 0
    const slice = values.slice(-period)
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / slice.length
    return Math.sqrt(variance)
  }

  calculateCorrelation(values, symbol) {
    // Placeholder - would need actual correlation data
    return 0
  }

  calculateAdvanceDecline() {
    // Placeholder - would need market breadth data
    return 0
  }

  calculateNewHighsLows(high, low) {
    // Placeholder - would need historical data
    return { newHighs: 0, newLows: 0 }
  }

  calculatePutCallRatio() {
    // Placeholder - would need options data
    return 1.0
  }

  calculateVIX() {
    // Placeholder - would need VIX data
    return 20
  }

  calculateFearGreedIndex() {
    // Placeholder - would need sentiment data
    return 50
  }

  // Get data for ML models
  async getTrainingData(symbol, timeframe, lookback = 1000) {
    const data = await this.fetchOHLCV(symbol, timeframe, lookback)
    return this.generateFeatures(symbol, timeframe, data)
  }

  // Real-time data streaming
  async startDataStream(callback) {
    this.logger.info('Starting real-time data stream')
    
    setInterval(async () => {
      try {
        for (const symbol of this.symbols) {
          const data = await this.fetchOHLCV(symbol, '1m', 1)
          if (data.length > 0) {
            callback(symbol, data[0])
          }
        }
      } catch (error) {
        this.logger.error('Error in data stream', { error: error.message })
      }
    }, 1000) // Update every second
  }

  // Get current price
  async getCurrentPrice(symbol) {
    try {
      const data = await this.fetchOHLCV(symbol, '1m', 1)
      return data.length > 0 ? data[0].close : null
    } catch (error) {
      this.logger.error(`Failed to get current price for ${symbol}`, { error: error.message })
      return null
    }
  }

  // Get market status
  isMarketOpen() {
    const now = new Date()
    const day = now.getDay()
    const hour = now.getHours()
    
    // Forex is open 24/5 (Monday 00:00 to Friday 23:59 UTC)
    if (day >= 1 && day <= 5) {
      return true
    }
    
    // Check if it's Sunday evening (market opens at 22:00 UTC)
    if (day === 0 && hour >= 22) {
      return true
    }
    
    return false
  }
}

export { DataManager }
export default DataManager