import { Logger } from '../utils/logger.js'
import { createClient } from 'redis'
import { DDQNModel } from './models/ddqn.js'
import { LSTMModel } from './models/lstm.js'
import { RandomForestModel } from './models/randomforest.js'
import { DataManager } from '../data/manager.js'
import { DataPreprocessor } from '../data/preprocessor.js'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class ModelManager {
  constructor() {
    this.logger = new Logger()
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    })
    
    // Initialize models
    this.ddqn = new DDQNModel({
      state_size: 50,
      action_size: 3,
      hidden_layers: [128, 64, 32],
      learning_rate: 0.001,
      discount_factor: 0.95,
      epsilon: 1.0,
      epsilon_min: 0.01,
      epsilon_decay: 0.995,
      memory_size: 10000,
      batch_size: 32,
      target_update_frequency: 100
    })
    
    this.lstm = new LSTMModel({
      sequence_length: 60,
      feature_count: 50,
      hidden_size: 128,
      num_layers: 2,
      dropout: 0.2,
      learning_rate: 0.001,
      batch_size: 32,
      epochs: 100,
      early_stopping_patience: 10
    })
    
    this.randomForest = new RandomForestModel({
      n_estimators: 100,
      max_depth: 10,
      min_samples_split: 2,
      min_samples_leaf: 1,
      max_features: 'sqrt',
      bootstrap: true,
      random_state: 42
    })
    
    // Ensemble configuration
    this.ensemble = {
      enabled: true,
      weights: {
        ddqn: 0.4,
        lstm: 0.35,
        random_forest: 0.25
      },
      adaptive_weights: true,
      performance_window: 100,
      rebalance_frequency: 50
    }
    
    // Continuous training configuration
    this.continuousTraining = {
      enabled: true,
      retrain_frequency: 100, // Retrain every 100 trading steps
      performance_threshold: 0.05, // Retrain if performance drops by 5%
      data_buffer_size: 10000,
      validation_split: 0.2
    }
    
    // Performance tracking
    this.performance = {
      overall: {
        accuracy: 0,
        precision: 0,
        recall: 0,
        f1_score: 0,
        sharpe_ratio: 0,
        max_drawdown: 0,
        profit_factor: 0,
        win_rate: 0
      },
      models: {
        ddqn: {},
        lstm: {},
        random_forest: {}
      },
      ensemble: {
        accuracy: 0,
        sharpe_ratio: 0,
        max_drawdown: 0
      }
    }
    
    // Training data buffer
    this.trainingBuffer = []
    this.isInitialized = false
  }

  async initialize() {
    try {
      await this.redis.connect()
      
      // Initialize all models
      await Promise.all([
        this.ddqn.initialize(),
        this.lstm.initialize(),
        this.randomForest.initialize()
      ])
      
      // Load ensemble weights
      await this.loadEnsembleWeights()
      
      // Start continuous training
      if (this.continuousTraining.enabled) {
        this.startContinuousTraining()
      }
      
      this.isInitialized = true
      this.logger.info('ModelManager: Initialized successfully')
    } catch (error) {
      this.logger.error('ModelManager: Initialization failed', error)
      throw error
    }
  }

  async predict(symbol, timeframe, marketData) {
    if (!this.isInitialized) {
      throw new Error('ModelManager not initialized')
    }
    
    try {
      // Prepare features for each model
      const features = await this.prepareFeatures(marketData, symbol, timeframe)
      
      // Get predictions from each model
      const predictions = await Promise.all([
        this.getDDQNPrediction(features),
        this.getLSTMPrediction(features),
        this.getRandomForestPrediction(features)
      ])
      
      // Combine predictions using ensemble
      const ensemblePrediction = this.combinePredictions(predictions)
      
      // Update model weights based on performance
      if (this.ensemble.adaptive_weights) {
        await this.updateEnsembleWeights(predictions, ensemblePrediction)
      }
      
      return {
        prediction: ensemblePrediction,
        individual_predictions: {
          ddqn: predictions[0],
          lstm: predictions[1],
          random_forest: predictions[2]
        },
        confidence: this.calculateConfidence(predictions),
        weights: this.ensemble.weights
      }
    } catch (error) {
      this.logger.error('Error in prediction:', error)
      throw error
    }
  }

  async prepareFeatures(marketData, symbol, timeframe) {
    // Extract features for each model type
    const features = {
      ddqn: this.prepareDDQNFeatures(marketData),
      lstm: this.prepareLSTMFeatures(marketData),
      random_forest: this.prepareRandomForestFeatures(marketData)
    }
    
    return features
  }

  prepareDDQNFeatures(marketData) {
    // Prepare state vector for DDQN
    const state = []
    
    // Price features
    if (marketData.length > 0) {
      const latest = marketData[marketData.length - 1]
      state.push(
        latest.open,
        latest.high,
        latest.low,
        latest.close,
        latest.volume
      )
    }
    
    // Technical indicators
    if (marketData.length >= 20) {
      const closes = marketData.map(d => d.close)
      const sma_20 = this.calculateSMA(closes, 20)
      const sma_50 = this.calculateSMA(closes, 50)
      const rsi = this.calculateRSI(closes, 14)
      
      state.push(sma_20, sma_50, rsi)
    }
    
    // Pad or truncate to fixed size
    while (state.length < 50) {
      state.push(0)
    }
    
    return state.slice(0, 50)
  }

  prepareLSTMFeatures(marketData) {
    // Prepare sequence for LSTM
    const sequence = []
    
    for (let i = 0; i < Math.min(60, marketData.length); i++) {
      const data = marketData[marketData.length - 60 + i]
      const features = []
      
      // Basic price features
      features.push(data.open, data.high, data.low, data.close, data.volume)
      
      // Technical indicators
      if (i >= 20) {
        const closes = marketData.slice(marketData.length - 60 + i - 20, marketData.length - 60 + i).map(d => d.close)
        const sma = this.calculateSMA(closes, 20)
        const rsi = this.calculateRSI(closes, 14)
        features.push(sma, rsi)
      } else {
        features.push(0, 0)
      }
      
      sequence.push(features)
    }
    
    // Pad sequence if necessary
    while (sequence.length < 60) {
      sequence.unshift(new Array(7).fill(0))
    }
    
    return sequence.slice(0, 60)
  }

  prepareRandomForestFeatures(marketData) {
    // Prepare feature vector for Random Forest
    const features = {}
    
    if (marketData.length > 0) {
      const latest = marketData[marketData.length - 1]
      
      // Basic price features
      features.open = latest.open
      features.high = latest.high
      features.low = latest.low
      features.close = latest.close
      features.volume = latest.volume
      features.price_change = latest.close - latest.open
      features.price_change_pct = (latest.close - latest.open) / latest.open
      features.high_low_ratio = latest.high / latest.low
    }
    
    // Technical indicators
    if (marketData.length >= 20) {
      const closes = marketData.map(d => d.close)
      const volumes = marketData.map(d => d.volume)
      
      features.sma_20 = this.calculateSMA(closes, 20)
      features.sma_50 = this.calculateSMA(closes, 50)
      features.rsi = this.calculateRSI(closes, 14)
      features.volume_sma = this.calculateSMA(volumes, 20)
      features.volatility = this.calculateVolatility(closes, 20)
    }
    
    return features
  }

  async getDDQNPrediction(features) {
    try {
      const q_values = await this.ddqn.predict(features.ddqn)
      const action = q_values.indexOf(Math.max(...q_values))
      
      // Convert action to prediction
      switch (action) {
        case 0: return -1 // Sell
        case 1: return 0  // Hold
        case 2: return 1  // Buy
        default: return 0
      }
    } catch (error) {
      this.logger.error('DDQN prediction error:', error)
      return 0
    }
  }

  async getLSTMPrediction(features) {
    try {
      const prediction = await this.lstm.predict(features.lstm)
      
      // Convert to trading signal
      if (prediction > 0.1) return 1
      if (prediction < -0.1) return -1
      return 0
    } catch (error) {
      this.logger.error('LSTM prediction error:', error)
      return 0
    }
  }

  async getRandomForestPrediction(features) {
    try {
      const predictions = await this.randomForest.predict([features.random_forest])
      const prediction = predictions[0]
      
      // Convert to trading signal
      if (prediction > 0.1) return 1
      if (prediction < -0.1) return -1
      return 0
    } catch (error) {
      this.logger.error('Random Forest prediction error:', error)
      return 0
    }
  }

  combinePredictions(predictions) {
    const [ddqn_pred, lstm_pred, rf_pred] = predictions
    
    // Weighted average
    const weighted_pred = 
      ddqn_pred * this.ensemble.weights.ddqn +
      lstm_pred * this.ensemble.weights.lstm +
      rf_pred * this.ensemble.weights.random_forest
    
    // Convert to trading signal
    if (weighted_pred > 0.3) return 1
    if (weighted_pred < -0.3) return -1
    return 0
  }

  calculateConfidence(predictions) {
    const [ddqn_pred, lstm_pred, rf_pred] = predictions
    
    // Calculate agreement between models
    const agreement = this.calculateAgreement(predictions)
    
    // Calculate confidence based on agreement and individual model confidence
    const confidence = agreement * 0.7 + this.calculateIndividualConfidence(predictions) * 0.3
    
    return Math.min(1, Math.max(0, confidence))
  }

  calculateAgreement(predictions) {
    const [ddqn_pred, lstm_pred, rf_pred] = predictions
    
    // Count how many models agree
    let agreement = 0
    if (ddqn_pred === lstm_pred) agreement++
    if (ddqn_pred === rf_pred) agreement++
    if (lstm_pred === rf_pred) agreement++
    
    return agreement / 3
  }

  calculateIndividualConfidence(predictions) {
    // Calculate confidence based on prediction magnitude
    const avgMagnitude = predictions.reduce((sum, pred) => sum + Math.abs(pred), 0) / predictions.length
    return Math.min(1, avgMagnitude)
  }

  async updateEnsembleWeights(predictions, ensemblePrediction) {
    // Update weights based on recent performance
    const performance = await this.calculateModelPerformance(predictions, ensemblePrediction)
    
    // Update weights using exponential moving average
    const alpha = 0.1
    this.ensemble.weights.ddqn = alpha * performance.ddqn + (1 - alpha) * this.ensemble.weights.ddqn
    this.ensemble.weights.lstm = alpha * performance.lstm + (1 - alpha) * this.ensemble.weights.lstm
    this.ensemble.weights.random_forest = alpha * performance.random_forest + (1 - alpha) * this.ensemble.weights.random_forest
    
    // Normalize weights
    const total = this.ensemble.weights.ddqn + this.ensemble.weights.lstm + this.ensemble.weights.random_forest
    this.ensemble.weights.ddqn /= total
    this.ensemble.weights.lstm /= total
    this.ensemble.weights.random_forest /= total
    
    // Save updated weights
    await this.saveEnsembleWeights()
  }

  async calculateModelPerformance(predictions, ensemblePrediction) {
    // Simplified performance calculation
    // In production, use actual trading results
    
    const performance = {
      ddqn: 0.5,
      lstm: 0.5,
      random_forest: 0.5
    }
    
    // Calculate based on prediction accuracy
    const [ddqn_pred, lstm_pred, rf_pred] = predictions
    
    // Simple accuracy measure
    if (ddqn_pred === ensemblePrediction) performance.ddqn = 0.8
    if (lstm_pred === ensemblePrediction) performance.lstm = 0.8
    if (rf_pred === ensemblePrediction) performance.random_forest = 0.8
    
    return performance
  }

  async trainModels(trainingData) {
    if (!this.isInitialized) {
      throw new Error('ModelManager not initialized')
    }
    
    this.logger.info('Training all models...')
    
    try {
      // Prepare training data for each model
      const { ddqnData, lstmData, rfData } = await this.prepareTrainingData(trainingData)
      
      // Train each model
      await Promise.all([
        this.trainDDQN(ddqnData),
        this.trainLSTM(lstmData),
        this.trainRandomForest(rfData)
      ])
      
      // Update performance metrics
      await this.updatePerformanceMetrics()
      
      this.logger.info('All models trained successfully')
    } catch (error) {
      this.logger.error('Error training models:', error)
      throw error
    }
  }

  async prepareTrainingData(trainingData) {
    const ddqnData = []
    const lstmData = { sequences: [], targets: [] }
    const rfData = { features: [], targets: [] }
    
    for (let i = 0; i < trainingData.length; i++) {
      const data = trainingData[i]
      
      // DDQN training data
      if (i > 0) {
        const state = this.prepareDDQNFeatures(trainingData.slice(0, i + 1))
        const nextState = this.prepareDDQNFeatures(trainingData.slice(0, i + 2))
        const reward = this.calculateReward(trainingData[i - 1], data)
        const action = this.getActionFromData(trainingData[i - 1], data)
        
        ddqnData.push({
          state,
          action,
          reward,
          next_state: nextState,
          done: i === trainingData.length - 1
        })
      }
      
      // LSTM training data
      if (i >= 60) {
        const sequence = this.prepareLSTMFeatures(trainingData.slice(i - 60, i + 1))
        const target = this.calculateTarget(trainingData[i - 1], data)
        
        lstmData.sequences.push(sequence)
        lstmData.targets.push(target)
      }
      
      // Random Forest training data
      const features = this.prepareRandomForestFeatures(trainingData.slice(0, i + 1))
      const target = this.calculateTarget(trainingData[i - 1], data)
      
      rfData.features.push(features)
      rfData.targets.push(target)
    }
    
    return { ddqnData, lstmData, rfData }
  }

  calculateReward(prevData, currentData) {
    // Calculate reward based on price movement and risk
    const priceChange = (currentData.close - prevData.close) / prevData.close
    const volatility = Math.abs(priceChange)
    
    // Reward for correct predictions
    let reward = priceChange * 100 // Scale reward
    
    // Penalty for high volatility
    if (volatility > 0.05) {
      reward *= 0.5
    }
    
    // Bonus for consistent performance
    if (Math.abs(priceChange) > 0.02) {
      reward *= 1.2
    }
    
    return reward
  }

  getActionFromData(prevData, currentData) {
    const priceChange = (currentData.close - prevData.close) / prevData.close
    
    if (priceChange > 0.01) return 2 // Buy
    if (priceChange < -0.01) return 0 // Sell
    return 1 // Hold
  }

  calculateTarget(prevData, currentData) {
    const priceChange = (currentData.close - prevData.close) / prevData.close
    return priceChange
  }

  async trainDDQN(ddqnData) {
    for (const data of ddqnData) {
      await this.ddqn.trainStep(data.state, data.action, data.reward, data.next_state, data.done)
    }
  }

  async trainLSTM(lstmData) {
    if (lstmData.sequences.length > 0) {
      await this.lstm.train(lstmData.sequences, lstmData.targets)
    }
  }

  async trainRandomForest(rfData) {
    if (rfData.features.length > 0) {
      await this.randomForest.train(rfData.features, rfData.targets)
    }
  }

  async updatePerformanceMetrics() {
    // Get performance from each model
    const ddqnStatus = await this.ddqn.getModelStatus()
    const lstmStatus = await this.lstm.getModelStatus()
    const rfStatus = await this.randomForest.getModelStatus()
    
    // Update individual model performance
    this.performance.models.ddqn = ddqnStatus.performance
    this.performance.models.lstm = lstmStatus.performance
    this.performance.models.random_forest = rfStatus.performance
    
    // Calculate overall performance
    this.performance.overall = this.calculateOverallPerformance()
  }

  calculateOverallPerformance() {
    const models = Object.values(this.performance.models)
    
    return {
      accuracy: models.reduce((sum, model) => sum + (model.accuracy || 0), 0) / models.length,
      precision: models.reduce((sum, model) => sum + (model.precision || 0), 0) / models.length,
      recall: models.reduce((sum, model) => sum + (model.recall || 0), 0) / models.length,
      f1_score: models.reduce((sum, model) => sum + (model.f1_score || 0), 0) / models.length,
      sharpe_ratio: models.reduce((sum, model) => sum + (model.sharpe_ratio || 0), 0) / models.length,
      max_drawdown: models.reduce((sum, model) => sum + (model.max_drawdown || 0), 0) / models.length,
      profit_factor: models.reduce((sum, model) => sum + (model.profit_factor || 0), 0) / models.length,
      win_rate: models.reduce((sum, model) => sum + (model.win_rate || 0), 0) / models.length
    }
  }

  startContinuousTraining() {
    setInterval(async () => {
      try {
        await this.continuousTrainingStep()
      } catch (error) {
        this.logger.error('Continuous training error:', error)
      }
    }, 60000) // Run every minute
  }

  async continuousTrainingStep() {
    if (!this.continuousTraining.enabled) return
    
    // Check if we need to retrain
    const shouldRetrain = this.shouldRetrain()
    
    if (shouldRetrain) {
      this.logger.info('Starting continuous training...')
      
      // Use training buffer for retraining
      if (this.trainingBuffer.length > 0) {
        await this.trainModels(this.trainingBuffer)
      }
      
      // Clear old data from buffer
      if (this.trainingBuffer.length > this.continuousTraining.data_buffer_size) {
        this.trainingBuffer = this.trainingBuffer.slice(-this.continuousTraining.data_buffer_size)
      }
    }
    
    // Run continuous learning for each model
    await Promise.all([
      this.ddqn.continuousLearning(),
      this.lstm.continuousLearning(),
      this.randomForest.continuousLearning()
    ])
  }

  shouldRetrain() {
    // Retrain if performance has dropped
    if (this.performance.overall.accuracy < this.continuousTraining.performance_threshold) {
      return true
    }
    
    // Retrain at regular intervals
    if (this.trainingStep % this.continuousTraining.retrain_frequency === 0) {
      return true
    }
    
    return false
  }

  async addTrainingData(data) {
    this.trainingBuffer.push(data)
    
    // Add to individual model buffers
    await this.ddqn.addTrainingData?.(data)
    await this.lstm.addTrainingData?.(data)
    await this.randomForest.addTrainingData?.(data)
  }

  async saveEnsembleWeights() {
    try {
      const key = 'ensemble_weights'
      await this.redis.setex(key, 86400, JSON.stringify(this.ensemble.weights))
    } catch (error) {
      this.logger.error('Failed to save ensemble weights:', error)
    }
  }

  async loadEnsembleWeights() {
    try {
      const key = 'ensemble_weights'
      const data = await this.redis.get(key)
      
      if (data) {
        this.ensemble.weights = JSON.parse(data)
      }
    } catch (error) {
      this.logger.error('Failed to load ensemble weights:', error)
    }
  }

  async getModelStatus() {
    return {
      isInitialized: this.isInitialized,
      performance: this.performance,
      ensemble: this.ensemble,
      models: {
        ddqn: await this.ddqn.getModelStatus(),
        lstm: await this.lstm.getModelStatus(),
        random_forest: await this.randomForest.getModelStatus()
      }
    }
  }

  async retrainAll() {
    this.logger.info('Retraining all models...')
    
    try {
      await this.trainModels(this.trainingBuffer)
      this.logger.info('All models retrained successfully')
    } catch (error) {
      this.logger.error('Error retraining models:', error)
      throw error
    }
  }

  async validateModels() {
    this.logger.info('Validating models...')
    
    try {
      // Validate each model
      const ddqnStatus = await this.ddqn.getModelStatus()
      const lstmStatus = await this.lstm.getModelStatus()
      const rfStatus = await this.randomForest.getModelStatus()
      
      // Check if models are performing well
      const validationResults = {
        ddqn: ddqnStatus.performance.sharpe_ratio > 0.5,
        lstm: lstmStatus.performance.r2_score > 0.3,
        random_forest: rfStatus.performance.accuracy > 0.6
      }
      
      this.logger.info('Model validation completed:', validationResults)
      return validationResults
    } catch (error) {
      this.logger.error('Error validating models:', error)
      throw error
    }
  }

  // Utility functions
  calculateSMA(data, period) {
    if (data.length < period) return data[data.length - 1]
    const sum = data.slice(-period).reduce((a, b) => a + b, 0)
    return sum / period
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

  calculateVolatility(data, period) {
    if (data.length < period) return 0
    
    const returns = []
    for (let i = 1; i < data.length; i++) {
      returns.push((data[i] - data[i - 1]) / data[i - 1])
    }
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length
    
    return Math.sqrt(variance)
  }

  async cleanup() {
    try {
      await Promise.all([
        this.ddqn.cleanup(),
        this.lstm.cleanup(),
        this.randomForest.cleanup()
      ])
      
      await this.redis.quit()
      this.logger.info('ModelManager: Cleaned up successfully')
    } catch (error) {
      this.logger.error('ModelManager: Cleanup failed', error)
    }
  }
}