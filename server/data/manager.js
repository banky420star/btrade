import ccxt from 'ccxt'
import { createClient } from 'redis'
import { Logger } from '../utils/logger.js'
import { TechnicalIndicators } from 'technicalindicators'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class DataManager {
  constructor() {
    this.logger = new Logger()
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    })
    
    // Initialize exchanges
    this.exchanges = {
      binance: new ccxt.binance({
        apiKey: process.env.BINANCE_API_KEY,
        secret: process.env.BINANCE_SECRET,
        sandbox: process.env.NODE_ENV !== 'production',
        enableRateLimit: true
      }),
      coinbase: new ccxt.coinbasepro({
        apiKey: process.env.COINBASE_API_KEY,
        secret: process.env.COINBASE_SECRET,
        passphrase: process.env.COINBASE_PASSPHRASE,
        sandbox: process.env.NODE_ENV !== 'production',
        enableRateLimit: true
      }),
      kraken: new ccxt.kraken({
        apiKey: process.env.KRAKEN_API_KEY,
        secret: process.env.KRAKEN_SECRET,
        sandbox: process.env.NODE_ENV !== 'production',
        enableRateLimit: true
      })
    }
    
    // Trading pairs to monitor
    this.symbols = [
      'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'ADA/USDT', 'SOL/USDT',
      'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD',
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'
    ]
    
    // Data storage
    this.marketData = new Map()
    this.indicators = new Map()
    this.features = new Map()
    
    // Configuration
    this.timeframes = ['1m', '5m', '15m', '1h', '4h', '1d']
    this.lookbackPeriods = {
      '1m': 1000,
      '5m': 500,
      '15m': 300,
      '1h': 200,
      '4h': 100,
      '1d': 50
    }
    
    this.isInitialized = false
  }

  async initialize() {
    try {
      await this.redis.connect()
      this.logger.info('DataManager: Redis connected')
      
      // Load historical data
      await this.loadHistoricalData()
      
      // Start real-time data collection
      await this.startRealTimeDataCollection()
      
      this.isInitialized = true
      this.logger.info('DataManager: Initialized successfully')
    } catch (error) {
      this.logger.error('DataManager: Initialization failed', error)
      throw error
    }
  }

  async loadHistoricalData() {
    this.logger.info('DataManager: Loading historical data...')
    
    for (const symbol of this.symbols) {
      for (const timeframe of this.timeframes) {
        try {
          const data = await this.fetchHistoricalData(symbol, timeframe)
          if (data && data.length > 0) {
            await this.processAndStoreData(symbol, timeframe, data)
            this.logger.info(`Loaded ${data.length} candles for ${symbol} ${timeframe}`)
          }
        } catch (error) {
          this.logger.error(`Failed to load data for ${symbol} ${timeframe}:`, error)
        }
      }
    }
  }

  async fetchHistoricalData(symbol, timeframe, limit = 1000) {
    try {
      // Try different exchanges for different asset types
      let exchange = this.exchanges.binance
      
      if (symbol.includes('/USD') && !symbol.includes('USDT')) {
        exchange = this.exchanges.kraken
      } else if (symbol.match(/^[A-Z]{3,5}$/) && !symbol.includes('/')) {
        // Stock symbols - use a different approach
        return await this.fetchStockData(symbol, timeframe, limit)
      }
      
      const data = await exchange.fetchOHLCV(symbol, timeframe, undefined, limit)
      return data.map(candle => ({
        timestamp: candle[0],
        open: candle[1],
        high: candle[2],
        low: candle[3],
        close: candle[4],
        volume: candle[5]
      }))
    } catch (error) {
      this.logger.error(`Error fetching data for ${symbol}:`, error)
      return []
    }
  }

  async fetchStockData(symbol, timeframe, limit) {
    // Mock stock data - in production, integrate with real stock API
    const now = Date.now()
    const interval = this.getTimeframeMs(timeframe)
    const data = []
    
    for (let i = limit; i > 0; i--) {
      const timestamp = now - (i * interval)
      const basePrice = 100 + Math.random() * 50
      const volatility = 0.02
      
      data.push({
        timestamp,
        open: basePrice,
        high: basePrice * (1 + Math.random() * volatility),
        low: basePrice * (1 - Math.random() * volatility),
        close: basePrice * (1 + (Math.random() - 0.5) * volatility),
        volume: Math.random() * 1000000
      })
    }
    
    return data
  }

  getTimeframeMs(timeframe) {
    const timeframes = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000
    }
    return timeframes[timeframe] || 60000
  }

  async processAndStoreData(symbol, timeframe, data) {
    // Calculate technical indicators
    const indicators = this.calculateTechnicalIndicators(data)
    
    // Store in Redis
    const key = `market_data:${symbol}:${timeframe}`
    await this.redis.setex(key, 86400, JSON.stringify(data)) // 24h TTL
    
    // Store indicators
    const indicatorsKey = `indicators:${symbol}:${timeframe}`
    await this.redis.setex(indicatorsKey, 86400, JSON.stringify(indicators))
    
    // Update in-memory cache
    this.marketData.set(`${symbol}:${timeframe}`, data)
    this.indicators.set(`${symbol}:${timeframe}`, indicators)
    
    // Generate features for ML
    const features = this.generateFeatures(data, indicators)
    this.features.set(`${symbol}:${timeframe}`, features)
  }

  calculateTechnicalIndicators(data) {
    const closes = data.map(d => d.close)
    const highs = data.map(d => d.high)
    const lows = data.map(d => d.low)
    const volumes = data.map(d => d.volume)
    
    const indicators = {}
    
    try {
      // Moving averages
      indicators.sma_20 = TechnicalIndicators.SMA.calculate({ period: 20, values: closes })
      indicators.sma_50 = TechnicalIndicators.SMA.calculate({ period: 50, values: closes })
      indicators.ema_12 = TechnicalIndicators.EMA.calculate({ period: 12, values: closes })
      indicators.ema_26 = TechnicalIndicators.EMA.calculate({ period: 26, values: closes })
      
      // MACD
      indicators.macd = TechnicalIndicators.MACD.calculate({
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9
      })
      
      // RSI
      indicators.rsi = TechnicalIndicators.RSI.calculate({ period: 14, values: closes })
      
      // Bollinger Bands
      indicators.bb = TechnicalIndicators.BollingerBands.calculate({
        period: 20,
        values: closes,
        stdDev: 2
      })
      
      // Stochastic
      indicators.stoch = TechnicalIndicators.Stochastic.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14,
        signalPeriod: 3
      })
      
      // Volume indicators
      indicators.volume_sma = TechnicalIndicators.SMA.calculate({ period: 20, values: volumes })
      indicators.obv = TechnicalIndicators.OBV.calculate({ close: closes, volume: volumes })
      
      // ATR for volatility
      indicators.atr = TechnicalIndicators.ATR.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14
      })
      
      // Williams %R
      indicators.williams_r = TechnicalIndicators.WilliamsR.calculate({
        high: highs,
        low: lows,
        close: closes,
        period: 14
      })
      
    } catch (error) {
      this.logger.error('Error calculating indicators:', error)
    }
    
    return indicators
  }

  generateFeatures(data, indicators) {
    const features = []
    const lookback = Math.min(50, data.length)
    
    for (let i = lookback; i < data.length; i++) {
      const feature = {
        timestamp: data[i].timestamp,
        price_features: {
          open: data[i].open,
          high: data[i].high,
          low: data[i].low,
          close: data[i].close,
          volume: data[i].volume,
          price_change: data[i].close - data[i].open,
          price_change_pct: (data[i].close - data[i].open) / data[i].open,
          high_low_ratio: data[i].high / data[i].low,
          volume_price_ratio: data[i].volume / data[i].close
        },
        technical_features: {},
        market_structure: {}
      }
      
      // Technical indicators features
      if (indicators.sma_20 && indicators.sma_20[i - 20]) {
        feature.technical_features.sma_20 = indicators.sma_20[i - 20]
        feature.technical_features.sma_20_ratio = data[i].close / indicators.sma_20[i - 20]
      }
      
      if (indicators.sma_50 && indicators.sma_50[i - 50]) {
        feature.technical_features.sma_50 = indicators.sma_50[i - 50]
        feature.technical_features.sma_20_50_ratio = 
          (indicators.sma_20[i - 20] || 0) / (indicators.sma_50[i - 50] || 1)
      }
      
      if (indicators.rsi && indicators.rsi[i - 14]) {
        feature.technical_features.rsi = indicators.rsi[i - 14]
        feature.technical_features.rsi_overbought = indicators.rsi[i - 14] > 70 ? 1 : 0
        feature.technical_features.rsi_oversold = indicators.rsi[i - 14] < 30 ? 1 : 0
      }
      
      if (indicators.macd && indicators.macd[i - 26]) {
        feature.technical_features.macd = indicators.macd[i - 26].MACD
        feature.technical_features.macd_signal = indicators.macd[i - 26].signal
        feature.technical_features.macd_histogram = indicators.macd[i - 26].histogram
      }
      
      if (indicators.bb && indicators.bb[i - 20]) {
        feature.technical_features.bb_upper = indicators.bb[i - 20].upper
        feature.technical_features.bb_lower = indicators.bb[i - 20].lower
        feature.technical_features.bb_middle = indicators.bb[i - 20].middle
        feature.technical_features.bb_position = (data[i].close - indicators.bb[i - 20].lower) / 
          (indicators.bb[i - 20].upper - indicators.bb[i - 20].lower)
      }
      
      if (indicators.atr && indicators.atr[i - 14]) {
        feature.technical_features.atr = indicators.atr[i - 14]
        feature.technical_features.volatility = indicators.atr[i - 14] / data[i].close
      }
      
      // Market structure features
      feature.market_structure.trend = this.calculateTrend(data, i, 20)
      feature.market_structure.momentum = this.calculateMomentum(data, i, 10)
      feature.market_structure.volatility_regime = this.calculateVolatilityRegime(data, i, 20)
      
      // Time-based features
      const date = new Date(data[i].timestamp)
      feature.time_features = {
        hour: date.getHours(),
        day_of_week: date.getDay(),
        month: date.getMonth(),
        is_weekend: date.getDay() === 0 || date.getDay() === 6 ? 1 : 0
      }
      
      features.push(feature)
    }
    
    return features
  }

  calculateTrend(data, index, period) {
    if (index < period) return 0
    
    const recent = data.slice(index - period, index)
    const first = recent[0].close
    const last = recent[recent.length - 1].close
    
    return (last - first) / first
  }

  calculateMomentum(data, index, period) {
    if (index < period) return 0
    
    const recent = data.slice(index - period, index)
    let momentum = 0
    
    for (let i = 1; i < recent.length; i++) {
      momentum += (recent[i].close - recent[i-1].close) / recent[i-1].close
    }
    
    return momentum / (period - 1)
  }

  calculateVolatilityRegime(data, index, period) {
    if (index < period) return 0
    
    const recent = data.slice(index - period, index)
    const returns = []
    
    for (let i = 1; i < recent.length; i++) {
      returns.push((recent[i].close - recent[i-1].close) / recent[i-1].close)
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length
    const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length
    
    return Math.sqrt(variance)
  }

  async startRealTimeDataCollection() {
    this.logger.info('DataManager: Starting real-time data collection...')
    
    // Start WebSocket connections for real-time data
    for (const [exchangeName, exchange] of Object.entries(this.exchanges)) {
      try {
        await this.startWebSocketFeed(exchangeName, exchange)
      } catch (error) {
        this.logger.error(`Failed to start WebSocket for ${exchangeName}:`, error)
      }
    }
  }

  async startWebSocketFeed(exchangeName, exchange) {
    // This is a simplified version - in production, implement proper WebSocket handling
    setInterval(async () => {
      try {
        await this.fetchLatestData()
      } catch (error) {
        this.logger.error(`Error in real-time feed for ${exchangeName}:`, error)
      }
    }, 5000) // Update every 5 seconds
  }

  async fetchLatestData() {
    for (const symbol of this.symbols) {
      for (const timeframe of this.timeframes) {
        try {
          const data = await this.fetchHistoricalData(symbol, timeframe, 100)
          if (data && data.length > 0) {
            await this.processAndStoreData(symbol, timeframe, data)
          }
        } catch (error) {
          this.logger.error(`Error fetching latest data for ${symbol} ${timeframe}:`, error)
        }
      }
    }
  }

  async getMarketData(symbol, timeframe, limit = 100) {
    const key = `${symbol}:${timeframe}`
    
    if (this.marketData.has(key)) {
      const data = this.marketData.get(key)
      return data.slice(-limit)
    }
    
    // Fallback to Redis
    const redisKey = `market_data:${symbol}:${timeframe}`
    const data = await this.redis.get(redisKey)
    
    if (data) {
      return JSON.parse(data).slice(-limit)
    }
    
    return []
  }

  async getIndicators(symbol, timeframe) {
    const key = `${symbol}:${timeframe}`
    
    if (this.indicators.has(key)) {
      return this.indicators.get(key)
    }
    
    // Fallback to Redis
    const redisKey = `indicators:${symbol}:${timeframe}`
    const data = await this.redis.get(redisKey)
    
    if (data) {
      return JSON.parse(data)
    }
    
    return {}
  }

  async getFeatures(symbol, timeframe, limit = 100) {
    const key = `${symbol}:${timeframe}`
    
    if (this.features.has(key)) {
      const features = this.features.get(key)
      return features.slice(-limit)
    }
    
    // Generate features on demand
    const data = await this.getMarketData(symbol, timeframe, limit)
    const indicators = await this.getIndicators(symbol, timeframe)
    
    if (data.length > 0) {
      return this.generateFeatures(data, indicators)
    }
    
    return []
  }

  async getLatestPrice(symbol) {
    try {
      const data = await this.getMarketData(symbol, '1m', 1)
      return data.length > 0 ? data[0].close : null
    } catch (error) {
      this.logger.error(`Error getting latest price for ${symbol}:`, error)
      return null
    }
  }

  async getPriceHistory(symbol, timeframe, hours = 24) {
    const data = await this.getMarketData(symbol, timeframe, hours * 60)
    return data.map(d => ({
      timestamp: d.timestamp,
      price: d.close,
      volume: d.volume
    }))
  }

  async cleanup() {
    try {
      await this.redis.quit()
      this.logger.info('DataManager: Cleaned up successfully')
    } catch (error) {
      this.logger.error('DataManager: Cleanup failed', error)
    }
  }
}