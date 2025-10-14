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

  // Technical Indicators
  calculateIndicators(symbol, timeframe, data) {
    const close = data.map(d => d.close)
    const high = data.map(d => d.high)
    const low = data.map(d => d.low)
    const volume = data.map(d => d.volume)

    const indicators = {
      // Moving Averages
      sma20: this.indicators.SMA.calculate({ period: 20, values: close }),
      sma50: this.indicators.SMA.calculate({ period: 50, values: close }),
      sma200: this.indicators.SMA.calculate({ period: 200, values: close }),
      ema12: this.indicators.EMA.calculate({ period: 12, values: close }),
      ema26: this.indicators.EMA.calculate({ period: 26, values: close }),
      
      // Oscillators
      rsi: this.indicators.RSI.calculate({ period: 14, values: close }),
      stochastic: this.indicators.Stochastic.calculate({
        high,
        low,
        close,
        period: 14,
        signalPeriod: 3
      }),
      
      // Volatility
      atr: this.indicators.ATR.calculate({
        high,
        low,
        close,
        period: 14
      }),
      bollinger: this.indicators.BollingerBands.calculate({
        period: 20,
        values: close,
        stdDev: 2
      }),
      
      // Volume
      obv: this.indicators.OBV.calculate({
        close,
        volume
      }),
      
      // Trend
      macd: this.indicators.MACD.calculate({
        values: close,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9
      }),
      
      // Momentum
      adx: this.indicators.ADX.calculate({
        high,
        low,
        close,
        period: 14
      })
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