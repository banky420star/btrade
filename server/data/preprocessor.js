import { Logger } from '../utils/logger.js'
import { createClient } from 'redis'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class DataPreprocessor {
  constructor(dataManager) {
    this.dataManager = dataManager
    this.logger = new Logger()
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    })
    
    // Preprocessing configuration
    this.config = {
      normalization: {
        method: 'zscore', // 'minmax', 'zscore', 'robust'
        clip_outliers: true,
        outlier_threshold: 3.0
      },
      feature_engineering: {
        lag_features: [1, 2, 3, 5, 10, 20],
        rolling_windows: [5, 10, 20, 50],
        technical_indicators: true,
        market_microstructure: true,
        sentiment_features: true
      },
      data_quality: {
        min_data_points: 100,
        max_missing_ratio: 0.1,
        outlier_detection: true,
        stationarity_test: true
      }
    }
    
    this.scalers = new Map()
    this.feature_importance = new Map()
    this.data_quality_metrics = new Map()
  }

  async initialize() {
    try {
      await this.redis.connect()
      this.logger.info('DataPreprocessor: Initialized successfully')
    } catch (error) {
      this.logger.error('DataPreprocessor: Initialization failed', error)
      throw error
    }
  }

  async preprocessData(symbol, timeframe, rawData) {
    this.logger.info(`Preprocessing data for ${symbol} ${timeframe}`)
    
    try {
      // Step 1: Data quality validation
      const qualityReport = await this.validateDataQuality(rawData)
      if (!qualityReport.isValid) {
        throw new Error(`Data quality validation failed: ${qualityReport.issues.join(', ')}`)
      }
      
      // Step 2: Clean and impute missing data
      const cleanedData = await this.cleanData(rawData)
      
      // Step 3: Feature engineering
      const engineeredFeatures = await this.engineerFeatures(cleanedData, symbol, timeframe)
      
      // Step 4: Feature selection
      const selectedFeatures = await this.selectFeatures(engineeredFeatures, symbol, timeframe)
      
      // Step 5: Normalization and scaling
      const normalizedData = await this.normalizeData(selectedFeatures, symbol, timeframe)
      
      // Step 6: Create training/validation/test splits
      const splits = await this.createDataSplits(normalizedData)
      
      // Step 7: Store processed data
      await this.storeProcessedData(symbol, timeframe, splits)
      
      this.logger.info(`Data preprocessing completed for ${symbol} ${timeframe}`)
      return splits
      
    } catch (error) {
      this.logger.error(`Data preprocessing failed for ${symbol} ${timeframe}:`, error)
      throw error
    }
  }

  async validateDataQuality(data) {
    const issues = []
    const metrics = {}
    
    // Check minimum data points
    if (data.length < this.config.data_quality.min_data_points) {
      issues.push(`Insufficient data points: ${data.length} < ${this.config.data_quality.min_data_points}`)
    }
    
    // Check for missing values
    const missingRatios = this.calculateMissingRatios(data)
    for (const [field, ratio] of Object.entries(missingRatios)) {
      if (ratio > this.config.data_quality.max_missing_ratio) {
        issues.push(`High missing ratio for ${field}: ${ratio.toFixed(3)}`)
      }
    }
    metrics.missing_ratios = missingRatios
    
    // Check for outliers
    if (this.config.data_quality.outlier_detection) {
      const outlierCounts = this.detectOutliers(data)
      metrics.outlier_counts = outlierCounts
      
      const totalOutliers = Object.values(outlierCounts).reduce((a, b) => a + b, 0)
      if (totalOutliers > data.length * 0.1) {
        issues.push(`High outlier ratio: ${totalOutliers}/${data.length}`)
      }
    }
    
    // Check for stationarity
    if (this.config.data_quality.stationarity_test) {
      const stationarityResults = this.testStationarity(data)
      metrics.stationarity = stationarityResults
      
      if (!stationarityResults.isStationary) {
        issues.push('Data is not stationary - may need differencing')
      }
    }
    
    // Check for data consistency
    const consistencyIssues = this.checkDataConsistency(data)
    issues.push(...consistencyIssues)
    
    this.data_quality_metrics.set('latest', metrics)
    
    return {
      isValid: issues.length === 0,
      issues,
      metrics
    }
  }

  calculateMissingRatios(data) {
    const ratios = {}
    const fields = ['open', 'high', 'low', 'close', 'volume']
    
    for (const field of fields) {
      const missingCount = data.filter(d => d[field] === null || d[field] === undefined || isNaN(d[field])).length
      ratios[field] = missingCount / data.length
    }
    
    return ratios
  }

  detectOutliers(data) {
    const outliers = {}
    const fields = ['open', 'high', 'low', 'close', 'volume']
    
    for (const field of fields) {
      const values = data.map(d => d[field]).filter(v => v !== null && v !== undefined && !isNaN(v))
      if (values.length === 0) continue
      
      const q1 = this.percentile(values, 25)
      const q3 = this.percentile(values, 75)
      const iqr = q3 - q1
      const lowerBound = q1 - 1.5 * iqr
      const upperBound = q3 + 1.5 * iqr
      
      outliers[field] = values.filter(v => v < lowerBound || v > upperBound).length
    }
    
    return outliers
  }

  percentile(arr, p) {
    const sorted = arr.slice().sort((a, b) => a - b)
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[index]
  }

  testStationarity(data) {
    // Simplified ADF test implementation
    const prices = data.map(d => d.close).filter(p => p !== null && !isNaN(p))
    if (prices.length < 10) return { isStationary: false, pValue: 1 }
    
    // Calculate first differences
    const diffs = []
    for (let i = 1; i < prices.length; i++) {
      diffs.push(prices[i] - prices[i-1])
    }
    
    // Simple variance test
    const originalVar = this.calculateVariance(prices)
    const diffVar = this.calculateVariance(diffs)
    
    // If variance of differences is significantly lower, likely stationary
    const isStationary = diffVar < originalVar * 0.5
    
    return {
      isStationary,
      pValue: isStationary ? 0.01 : 0.5,
      originalVariance: originalVar,
      diffVariance: diffVar
    }
  }

  calculateVariance(arr) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length
    return arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / arr.length
  }

  checkDataConsistency(data) {
    const issues = []
    
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      
      // Check OHLC consistency
      if (d.high < Math.max(d.open, d.close) || d.low > Math.min(d.open, d.close)) {
        issues.push(`OHLC inconsistency at index ${i}`)
      }
      
      // Check for negative prices
      if (d.open <= 0 || d.high <= 0 || d.low <= 0 || d.close <= 0) {
        issues.push(`Negative price at index ${i}`)
      }
      
      // Check for negative volume
      if (d.volume < 0) {
        issues.push(`Negative volume at index ${i}`)
      }
    }
    
    return issues
  }

  async cleanData(data) {
    this.logger.info('Cleaning data...')
    
    const cleaned = []
    
    for (let i = 0; i < data.length; i++) {
      const d = data[i]
      
      // Skip invalid data points
      if (!d || d.timestamp === null || d.timestamp === undefined) continue
      if (isNaN(d.open) || isNaN(d.high) || isNaN(d.low) || isNaN(d.close)) continue
      
      // Impute missing volume with median
      let volume = d.volume
      if (volume === null || volume === undefined || isNaN(volume)) {
        const volumes = data.map(d => d.volume).filter(v => v !== null && !isNaN(v))
        volume = volumes.length > 0 ? this.median(volumes) : 0
      }
      
      // Ensure OHLC consistency
      const open = Math.max(0, d.open)
      const close = Math.max(0, d.close)
      const high = Math.max(open, close, Math.max(0, d.high))
      const low = Math.min(open, close, Math.max(0, d.low))
      
      cleaned.push({
        timestamp: d.timestamp,
        open,
        high,
        low,
        close,
        volume: Math.max(0, volume)
      })
    }
    
    this.logger.info(`Cleaned data: ${data.length} -> ${cleaned.length} points`)
    return cleaned
  }

  median(arr) {
    const sorted = arr.slice().sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  }

  async engineerFeatures(data, symbol, timeframe) {
    this.logger.info(`Engineering features for ${symbol} ${timeframe}`)
    
    const features = []
    
    for (let i = 0; i < data.length; i++) {
      const feature = {
        timestamp: data[i].timestamp,
        price_features: {},
        technical_features: {},
        market_microstructure: {},
        sentiment_features: {},
        time_features: {},
        lag_features: {},
        rolling_features: {}
      }
      
      // Basic price features
      feature.price_features = {
        open: data[i].open,
        high: data[i].high,
        low: data[i].low,
        close: data[i].close,
        volume: data[i].volume,
        price_change: data[i].close - data[i].open,
        price_change_pct: (data[i].close - data[i].open) / data[i].open,
        high_low_ratio: data[i].high / data[i].low,
        body_size: Math.abs(data[i].close - data[i].open),
        body_size_pct: Math.abs(data[i].close - data[i].open) / data[i].open,
        upper_shadow: data[i].high - Math.max(data[i].open, data[i].close),
        lower_shadow: Math.min(data[i].open, data[i].close) - data[i].low,
        shadow_ratio: (data[i].high - Math.max(data[i].open, data[i].close)) / 
                     (Math.min(data[i].open, data[i].close) - data[i].low + 1e-8)
      }
      
      // Technical indicators (if enabled)
      if (this.config.feature_engineering.technical_indicators) {
        feature.technical_features = await this.calculateTechnicalFeatures(data, i)
      }
      
      // Market microstructure features
      if (this.config.feature_engineering.market_microstructure) {
        feature.market_microstructure = this.calculateMicrostructureFeatures(data, i)
      }
      
      // Time-based features
      feature.time_features = this.calculateTimeFeatures(data[i].timestamp)
      
      // Lag features
      for (const lag of this.config.feature_engineering.lag_features) {
        if (i >= lag) {
          feature.lag_features[`price_lag_${lag}`] = data[i - lag].close
          feature.lag_features[`volume_lag_${lag}`] = data[i - lag].volume
          feature.lag_features[`return_lag_${lag}`] = (data[i].close - data[i - lag].close) / data[i - lag].close
        }
      }
      
      // Rolling window features
      for (const window of this.config.feature_engineering.rolling_windows) {
        if (i >= window - 1) {
          const windowData = data.slice(i - window + 1, i + 1)
          feature.rolling_features[`price_std_${window}`] = this.calculateStd(windowData.map(d => d.close))
          feature.rolling_features[`volume_std_${window}`] = this.calculateStd(windowData.map(d => d.volume))
          feature.rolling_features[`price_mean_${window}`] = this.calculateMean(windowData.map(d => d.close))
          feature.rolling_features[`volume_mean_${window}`] = this.calculateMean(windowData.map(d => d.volume))
          feature.rolling_features[`price_skew_${window}`] = this.calculateSkewness(windowData.map(d => d.close))
          feature.rolling_features[`price_kurtosis_${window}`] = this.calculateKurtosis(windowData.map(d => d.close))
        }
      }
      
      features.push(feature)
    }
    
    return features
  }

  async calculateTechnicalFeatures(data, index) {
    const features = {}
    
    if (index < 20) return features
    
    const closes = data.slice(index - 20, index + 1).map(d => d.close)
    const highs = data.slice(index - 20, index + 1).map(d => d.high)
    const lows = data.slice(index - 20, index + 1).map(d => d.low)
    const volumes = data.slice(index - 20, index + 1).map(d => d.volume)
    
    // Simple moving averages
    features.sma_5 = this.calculateSMA(closes, 5)
    features.sma_10 = this.calculateSMA(closes, 10)
    features.sma_20 = this.calculateSMA(closes, 20)
    
    // Exponential moving averages
    features.ema_5 = this.calculateEMA(closes, 5)
    features.ema_10 = this.calculateEMA(closes, 10)
    features.ema_20 = this.calculateEMA(closes, 20)
    
    // RSI
    features.rsi = this.calculateRSI(closes, 14)
    
    // MACD
    const macd = this.calculateMACD(closes, 12, 26, 9)
    features.macd = macd.macd
    features.macd_signal = macd.signal
    features.macd_histogram = macd.histogram
    
    // Bollinger Bands
    const bb = this.calculateBollingerBands(closes, 20, 2)
    features.bb_upper = bb.upper
    features.bb_lower = bb.lower
    features.bb_middle = bb.middle
    features.bb_position = (closes[closes.length - 1] - bb.lower) / (bb.upper - bb.lower)
    
    // ATR
    features.atr = this.calculateATR(highs, lows, closes, 14)
    
    // Volume indicators
    features.volume_sma = this.calculateSMA(volumes, 20)
    features.volume_ratio = volumes[volumes.length - 1] / features.volume_sma
    
    return features
  }

  calculateSMA(data, period) {
    if (data.length < period) return data[data.length - 1]
    const sum = data.slice(-period).reduce((a, b) => a + b, 0)
    return sum / period
  }

  calculateEMA(data, period) {
    if (data.length < period) return data[data.length - 1]
    
    const multiplier = 2 / (period + 1)
    let ema = data[0]
    
    for (let i = 1; i < data.length; i++) {
      ema = (data[i] * multiplier) + (ema * (1 - multiplier))
    }
    
    return ema
  }

  calculateRSI(data, period) {
    if (data.length < period + 1) return 50
    
    const gains = []
    const losses = []
    
    for (let i = 1; i < data.length; i++) {
      const change = data[i] - data[i - 1]
      if (change > 0) {
        gains.push(change)
        losses.push(0)
      } else {
        gains.push(0)
        losses.push(-change)
      }
    }
    
    const avgGain = this.calculateSMA(gains, period)
    const avgLoss = this.calculateSMA(losses, period)
    
    if (avgLoss === 0) return 100
    
    const rs = avgGain / avgLoss
    return 100 - (100 / (1 + rs))
  }

  calculateMACD(data, fastPeriod, slowPeriod, signalPeriod) {
    const emaFast = this.calculateEMA(data, fastPeriod)
    const emaSlow = this.calculateEMA(data, slowPeriod)
    const macd = emaFast - emaSlow
    
    // For signal line, we'd need historical MACD values
    // This is a simplified version
    const signal = macd * 0.9 // Simplified signal calculation
    const histogram = macd - signal
    
    return { macd, signal, histogram }
  }

  calculateBollingerBands(data, period, stdDev) {
    const sma = this.calculateSMA(data, period)
    const variance = this.calculateVariance(data.slice(-period))
    const std = Math.sqrt(variance)
    
    return {
      upper: sma + (stdDev * std),
      middle: sma,
      lower: sma - (stdDev * std)
    }
  }

  calculateATR(highs, lows, closes, period) {
    if (highs.length < period + 1) return 0
    
    const trueRanges = []
    
    for (let i = 1; i < highs.length; i++) {
      const tr1 = highs[i] - lows[i]
      const tr2 = Math.abs(highs[i] - closes[i - 1])
      const tr3 = Math.abs(lows[i] - closes[i - 1])
      trueRanges.push(Math.max(tr1, tr2, tr3))
    }
    
    return this.calculateSMA(trueRanges, period)
  }

  calculateMicrostructureFeatures(data, index) {
    const features = {}
    
    if (index < 5) return features
    
    const recent = data.slice(index - 5, index + 1)
    
    // Price impact
    features.price_impact = this.calculatePriceImpact(recent)
    
    // Volume profile
    features.volume_profile = this.calculateVolumeProfile(recent)
    
    // Bid-ask spread proxy (using high-low as proxy)
    features.spread_proxy = recent[recent.length - 1].high - recent[recent.length - 1].low
    
    // Order flow imbalance (simplified)
    features.order_flow_imbalance = this.calculateOrderFlowImbalance(recent)
    
    return features
  }

  calculatePriceImpact(data) {
    const volumes = data.map(d => d.volume)
    const returns = []
    
    for (let i = 1; i < data.length; i++) {
      returns.push((data[i].close - data[i - 1].close) / data[i - 1].close)
    }
    
    // Simple correlation between volume and returns
    return this.calculateCorrelation(volumes.slice(1), returns)
  }

  calculateVolumeProfile(data) {
    const volumes = data.map(d => d.volume)
    const prices = data.map(d => d.close)
    
    const volumeWeightedPrice = data.reduce((sum, d) => sum + (d.close * d.volume), 0) / 
                              data.reduce((sum, d) => sum + d.volume, 0)
    
    return {
      vwap: volumeWeightedPrice,
      volume_std: this.calculateStd(volumes),
      price_volume_correlation: this.calculateCorrelation(prices, volumes)
    }
  }

  calculateOrderFlowImbalance(data) {
    // Simplified order flow calculation
    let buyVolume = 0
    let sellVolume = 0
    
    for (let i = 1; i < data.length; i++) {
      if (data[i].close > data[i - 1].close) {
        buyVolume += data[i].volume
      } else {
        sellVolume += data[i].volume
      }
    }
    
    return (buyVolume - sellVolume) / (buyVolume + sellVolume + 1e-8)
  }

  calculateTimeFeatures(timestamp) {
    const date = new Date(timestamp)
    
    return {
      hour: date.getHours(),
      day_of_week: date.getDay(),
      day_of_month: date.getDate(),
      month: date.getMonth(),
      quarter: Math.floor(date.getMonth() / 3),
      is_weekend: date.getDay() === 0 || date.getDay() === 6 ? 1 : 0,
      is_market_open: this.isMarketOpen(date),
      session: this.getTradingSession(date)
    }
  }

  isMarketOpen(date) {
    const hour = date.getHours()
    const day = date.getDay()
    
    // Simplified market hours (24/7 for crypto, business hours for others)
    if (day === 0 || day === 6) return 0 // Weekend
    if (hour >= 9 && hour < 16) return 1 // Business hours
    return 0
  }

  getTradingSession(date) {
    const hour = date.getHours()
    
    if (hour >= 0 && hour < 6) return 'asian'
    if (hour >= 6 && hour < 12) return 'european'
    if (hour >= 12 && hour < 18) return 'american'
    return 'after_hours'
  }

  calculateStd(data) {
    const mean = this.calculateMean(data)
    const variance = data.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / data.length
    return Math.sqrt(variance)
  }

  calculateMean(data) {
    return data.reduce((sum, val) => sum + val, 0) / data.length
  }

  calculateSkewness(data) {
    const mean = this.calculateMean(data)
    const std = this.calculateStd(data)
    const n = data.length
    
    const skewness = data.reduce((sum, val) => {
      return sum + Math.pow((val - mean) / std, 3)
    }, 0) / n
    
    return skewness
  }

  calculateKurtosis(data) {
    const mean = this.calculateMean(data)
    const std = this.calculateStd(data)
    const n = data.length
    
    const kurtosis = data.reduce((sum, val) => {
      return sum + Math.pow((val - mean) / std, 4)
    }, 0) / n - 3
    
    return kurtosis
  }

  calculateCorrelation(x, y) {
    if (x.length !== y.length) return 0
    
    const n = x.length
    const sumX = x.reduce((a, b) => a + b, 0)
    const sumY = y.reduce((a, b) => a + b, 0)
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0)
    const sumX2 = x.reduce((sum, val) => sum + val * val, 0)
    const sumY2 = y.reduce((sum, val) => sum + val * val, 0)
    
    const numerator = n * sumXY - sumX * sumY
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY))
    
    return denominator === 0 ? 0 : numerator / denominator
  }

  async selectFeatures(features, symbol, timeframe) {
    this.logger.info(`Selecting features for ${symbol} ${timeframe}`)
    
    // Simple feature selection based on variance and correlation
    const selectedFeatures = []
    
    for (const feature of features) {
      const selected = {
        timestamp: feature.timestamp,
        features: {}
      }
      
      // Select price features
      for (const [key, value] of Object.entries(feature.price_features)) {
        if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
          selected.features[`price_${key}`] = value
        }
      }
      
      // Select technical features
      for (const [key, value] of Object.entries(feature.technical_features)) {
        if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
          selected.features[`tech_${key}`] = value
        }
      }
      
      // Select time features
      for (const [key, value] of Object.entries(feature.time_features)) {
        if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
          selected.features[`time_${key}`] = value
        }
      }
      
      // Select lag features
      for (const [key, value] of Object.entries(feature.lag_features)) {
        if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
          selected.features[`lag_${key}`] = value
        }
      }
      
      // Select rolling features
      for (const [key, value] of Object.entries(feature.rolling_features)) {
        if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
          selected.features[`roll_${key}`] = value
        }
      }
      
      selectedFeatures.push(selected)
    }
    
    return selectedFeatures
  }

  async normalizeData(features, symbol, timeframe) {
    this.logger.info(`Normalizing data for ${symbol} ${timeframe}`)
    
    const key = `${symbol}:${timeframe}`
    const scaler = this.scalers.get(key) || this.createScaler()
    
    const normalized = []
    
    for (const feature of features) {
      const normalizedFeature = {
        timestamp: feature.timestamp,
        features: {}
      }
      
      for (const [key, value] of Object.entries(feature.features)) {
        normalizedFeature.features[key] = scaler.normalize(key, value)
      }
      
      normalized.push(normalizedFeature)
    }
    
    this.scalers.set(key, scaler)
    return normalized
  }

  createScaler() {
    const stats = new Map()
    
    return {
      normalize: (featureName, value) => {
        if (!stats.has(featureName)) {
          stats.set(featureName, { min: value, max: value, sum: 0, count: 0, sumSq: 0 })
        }
        
        const stat = stats.get(featureName)
        stat.min = Math.min(stat.min, value)
        stat.max = Math.max(stat.max, value)
        stat.sum += value
        stat.count += 1
        stat.sumSq += value * value
        
        // Z-score normalization
        const mean = stat.sum / stat.count
        const variance = (stat.sumSq / stat.count) - (mean * mean)
        const std = Math.sqrt(variance)
        
        return std === 0 ? 0 : (value - mean) / std
      }
    }
  }

  async createDataSplits(data) {
    const total = data.length
    const trainSize = Math.floor(total * 0.7)
    const valSize = Math.floor(total * 0.15)
    
    return {
      train: data.slice(0, trainSize),
      validation: data.slice(trainSize, trainSize + valSize),
      test: data.slice(trainSize + valSize),
      metadata: {
        total_samples: total,
        train_samples: trainSize,
        validation_samples: valSize,
        test_samples: total - trainSize - valSize,
        feature_count: Object.keys(data[0]?.features || {}).length
      }
    }
  }

  async storeProcessedData(symbol, timeframe, splits) {
    const key = `processed_data:${symbol}:${timeframe}`
    await this.redis.setex(key, 86400, JSON.stringify(splits))
    this.logger.info(`Stored processed data for ${symbol} ${timeframe}`)
  }

  async getProcessedData(symbol, timeframe) {
    const key = `processed_data:${symbol}:${timeframe}`
    const data = await this.redis.get(key)
    return data ? JSON.parse(data) : null
  }

  async cleanup() {
    try {
      await this.redis.quit()
      this.logger.info('DataPreprocessor: Cleaned up successfully')
    } catch (error) {
      this.logger.error('DataPreprocessor: Cleanup failed', error)
    }
  }
}