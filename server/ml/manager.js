import { Logger } from '../utils/logger.js'
import fs from 'fs-extra'
import path from 'path'
import { RandomForest } from './models/randomforest.js'
import { LSTM } from './models/lstm.js'
import { DDQN } from './models/ddqn.js'

class ModelManager {
  constructor() {
    this.logger = new Logger()
    this.models = new Map()
    this.modelStatus = new Map()
    this.trainingData = new Map()
    this.modelDir = path.join(process.cwd(), 'data', 'models')
    
    // Ensure model directory exists
    fs.ensureDirSync(this.modelDir)
    
    this.initializeModels()
  }

  async initialize() {
    this.logger.info('Initializing ModelManager')
    
    try {
      // Load existing models
      await this.loadModels()
      
      // Initialize model status
      this.initializeModelStatus()
      
      this.logger.info('ModelManager initialized successfully')
    } catch (error) {
      this.logger.error('Failed to initialize ModelManager', { error: error.message })
      throw error
    }
  }

  initializeModels() {
    // Random Forest for pattern recognition
    this.models.set('randomforest', new RandomForest({
      nEstimators: 100,
      maxDepth: 10,
      minSamplesSplit: 5,
      minSamplesLeaf: 2,
      randomState: 42
    }))

    // LSTM for time series forecasting
    this.models.set('lstm', new LSTM({
      sequenceLength: 60,
      hiddenUnits: 50,
      dropout: 0.2,
      epochs: 100,
      batchSize: 32,
      learningRate: 0.001
    }))

    // DDQN for reinforcement learning
    this.models.set('ddqn', new DDQN({
      stateSize: 20,
      actionSize: 3, // Buy, Sell, Hold
      hiddenUnits: 64,
      learningRate: 0.001,
      epsilon: 1.0,
      epsilonMin: 0.01,
      epsilonDecay: 0.995,
      memorySize: 10000,
      batchSize: 32
    }))
  }

  initializeModelStatus() {
    const modelNames = ['randomforest', 'lstm', 'ddqn']
    
    modelNames.forEach(name => {
      this.modelStatus.set(name, {
        name: this.getDisplayName(name),
        type: name,
        status: 'offline',
        accuracy: 0,
        lastUpdate: new Date().toISOString(),
        version: '1.0.0',
        performance: 0,
        trainingProgress: 0
      })
    })
  }

  getDisplayName(modelType) {
    const names = {
      'randomforest': 'Random Forest',
      'lstm': 'LSTM Forecaster',
      'ddqn': 'DDQN Agent'
    }
    return names[modelType] || modelType
  }

  async loadModels() {
    for (const [name, model] of this.models) {
      try {
        const modelPath = path.join(this.modelDir, `${name}.json`)
        if (await fs.pathExists(modelPath)) {
          await model.load(modelPath)
          this.updateModelStatus(name, 'active', model.getAccuracy())
          this.logger.info(`Loaded ${name} model`)
        } else {
          this.logger.info(`No saved model found for ${name}`)
        }
      } catch (error) {
        this.logger.warn(`Failed to load ${name} model`, { error: error.message })
      }
    }
  }

  async saveModels() {
    for (const [name, model] of this.models) {
      try {
        const modelPath = path.join(this.modelDir, `${name}.json`)
        await model.save(modelPath)
        this.logger.info(`Saved ${name} model`)
      } catch (error) {
        this.logger.error(`Failed to save ${name} model`, { error: error.message })
      }
    }
  }

  async trainModel(modelType, trainingData, validationData) {
    if (!this.models.has(modelType)) {
      throw new Error(`Unknown model type: ${modelType}`)
    }

    const model = this.models.get(modelType)
    this.updateModelStatus(modelType, 'training', 0, 0)

    try {
      this.logger.model(modelType, 'TRAINING_STARTED', 0, 0)
      
      const result = await model.train(trainingData, validationData, (progress) => {
        this.updateModelStatus(modelType, 'training', 0, progress)
      })

      this.updateModelStatus(modelType, 'active', result.accuracy, result.performance)
      await this.saveModels()
      
      this.logger.model(modelType, 'TRAINING_COMPLETED', result.accuracy, result.performance)
      
      return result
    } catch (error) {
      this.updateModelStatus(modelType, 'offline', 0, 0)
      this.logger.error(`Failed to train ${modelType} model`, { error: error.message })
      throw error
    }
  }

  async retrainAll() {
    this.logger.info('Starting retraining of all models')
    
    const results = {}
    
    for (const [name, model] of this.models) {
      try {
        this.logger.info(`Retraining ${name} model`)
        const result = await this.trainModel(name, null, null)
        results[name] = result
      } catch (error) {
        this.logger.error(`Failed to retrain ${name} model`, { error: error.message })
        results[name] = { error: error.message }
      }
    }
    
    return results
  }

  async predict(modelType, features) {
    if (!this.models.has(modelType)) {
      throw new Error(`Unknown model type: ${modelType}`)
    }

    const model = this.models.get(modelType)
    const status = this.modelStatus.get(modelType)
    
    if (status.status !== 'active') {
      throw new Error(`Model ${modelType} is not active`)
    }

    try {
      const prediction = await model.predict(features)
      this.logger.debug(`Prediction from ${modelType}`, { prediction })
      return prediction
    } catch (error) {
      this.logger.error(`Prediction failed for ${modelType}`, { error: error.message })
      throw error
    }
  }

  async ensemblePredict(features) {
    const predictions = {}
    const weights = {
      'randomforest': 0.4,
      'lstm': 0.4,
      'ddqn': 0.2
    }

    for (const [name, model] of this.models) {
      const status = this.modelStatus.get(name)
      if (status.status === 'active') {
        try {
          const prediction = await this.predict(name, features)
          predictions[name] = prediction
        } catch (error) {
          this.logger.warn(`Failed to get prediction from ${name}`, { error: error.message })
        }
      }
    }

    if (Object.keys(predictions).length === 0) {
      throw new Error('No active models available for prediction')
    }

    // Weighted ensemble prediction
    let ensembleScore = 0
    let totalWeight = 0

    for (const [name, prediction] of Object.entries(predictions)) {
      const weight = weights[name] || 0
      ensembleScore += prediction.score * weight
      totalWeight += weight
    }

    const finalScore = totalWeight > 0 ? ensembleScore / totalWeight : 0
    
    // Convert score to action
    let action = 'hold'
    let confidence = Math.abs(finalScore)
    
    if (finalScore > 0.6) {
      action = 'buy'
    } else if (finalScore < -0.6) {
      action = 'sell'
    }

    this.logger.debug('Ensemble prediction', {
      predictions,
      finalScore,
      action,
      confidence
    })

    return {
      action,
      confidence,
      score: finalScore,
      individualPredictions: predictions
    }
  }

  updateModelStatus(modelType, status, accuracy = null, performance = null) {
    const currentStatus = this.modelStatus.get(modelType)
    if (currentStatus) {
      const updatedStatus = {
        ...currentStatus,
        status,
        lastUpdate: new Date().toISOString()
      }
      
      if (accuracy !== null) {
        updatedStatus.accuracy = accuracy
      }
      
      if (performance !== null) {
        updatedStatus.performance = performance
        updatedStatus.trainingProgress = performance
      }
      
      this.modelStatus.set(modelType, updatedStatus)
    }
  }

  getModelStatus() {
    return Array.from(this.modelStatus.values())
  }

  async validateModels() {
    this.logger.info('Validating all models')
    
    const validationResults = {}
    
    for (const [name, model] of this.models) {
      try {
        const status = this.modelStatus.get(name)
        if (status.status === 'active') {
          const validation = await model.validate()
          validationResults[name] = validation
          
          if (validation.accuracy < 0.5) {
            this.logger.warn(`Model ${name} accuracy below threshold`, { accuracy: validation.accuracy })
            this.updateModelStatus(name, 'offline', validation.accuracy)
          }
        }
      } catch (error) {
        this.logger.error(`Validation failed for ${name}`, { error: error.message })
        validationResults[name] = { error: error.message }
      }
    }
    
    return validationResults
  }

  async getModelMetrics(modelType) {
    if (!this.models.has(modelType)) {
      throw new Error(`Unknown model type: ${modelType}`)
    }

    const model = this.models.get(modelType)
    return await model.getMetrics()
  }

  // Hot-swap model deployment
  async deployModel(modelType, modelPath) {
    if (!this.models.has(modelType)) {
      throw new Error(`Unknown model type: ${modelType}`)
    }

    try {
      const model = this.models.get(modelType)
      await model.load(modelPath)
      
      this.updateModelStatus(modelType, 'active', model.getAccuracy())
      this.logger.info(`Deployed new ${modelType} model`)
      
      return true
    } catch (error) {
      this.logger.error(`Failed to deploy ${modelType} model`, { error: error.message })
      return false
    }
  }

  // Rollback to previous model
  async rollbackModel(modelType) {
    try {
      const backupPath = path.join(this.modelDir, `${modelType}.backup.json`)
      if (await fs.pathExists(backupPath)) {
        await this.deployModel(modelType, backupPath)
        this.logger.info(`Rolled back ${modelType} model`)
        return true
      } else {
        this.logger.warn(`No backup found for ${modelType} model`)
        return false
      }
    } catch (error) {
      this.logger.error(`Failed to rollback ${modelType} model`, { error: error.message })
      return false
    }
  }

  // Create model backup
  async createBackup(modelType) {
    try {
      const modelPath = path.join(this.modelDir, `${modelType}.json`)
      const backupPath = path.join(this.modelDir, `${modelType}.backup.json`)
      
      if (await fs.pathExists(modelPath)) {
        await fs.copy(modelPath, backupPath)
        this.logger.info(`Created backup for ${modelType} model`)
        return true
      }
      return false
    } catch (error) {
      this.logger.error(`Failed to create backup for ${modelType} model`, { error: error.message })
      return false
    }
  }

  // Get model performance history
  getModelHistory(modelType) {
    // This would typically read from a database or log files
    // For now, return mock data
    return {
      accuracy: [0.65, 0.68, 0.72, 0.70, 0.75],
      performance: [0.60, 0.65, 0.70, 0.68, 0.73],
      timestamps: [
        new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        new Date().toISOString()
      ]
    }
  }
}

export { ModelManager }
export default ModelManager