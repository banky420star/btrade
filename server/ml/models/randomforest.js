import { RandomForestClassifier } from 'ml-random-forest'
import fs from 'fs-extra'
import path from 'path'

class RandomForest {
  constructor(config = {}) {
    this.config = {
      nEstimators: 100,
      maxDepth: 10,
      minSamplesSplit: 5,
      minSamplesLeaf: 2,
      randomState: 42,
      ...config
    }
    
    this.model = null
    this.isTrained = false
    this.accuracy = 0
    this.featureNames = []
    this.labelEncoder = new Map()
  }

  async train(trainingData, validationData, progressCallback) {
    if (!trainingData || trainingData.length === 0) {
      throw new Error('No training data provided')
    }

    try {
      // Prepare training data
      const { X, y } = this.prepareData(trainingData)
      
      // Initialize model
      this.model = new RandomForestClassifier(this.config)
      
      // Train model
      this.model.train(X, y)
      
      // Calculate accuracy
      if (validationData && validationData.length > 0) {
        const { X: valX, y: valY } = this.prepareData(validationData)
        const predictions = this.model.predict(valX)
        this.accuracy = this.calculateAccuracy(valY, predictions)
      } else {
        // Use training data for accuracy if no validation data
        const predictions = this.model.predict(X)
        this.accuracy = this.calculateAccuracy(y, predictions)
      }
      
      this.isTrained = true
      
      if (progressCallback) {
        progressCallback(100)
      }
      
      return {
        accuracy: this.accuracy,
        performance: this.accuracy * 100,
        modelType: 'RandomForest',
        features: this.featureNames.length
      }
    } catch (error) {
      throw new Error(`Random Forest training failed: ${error.message}`)
    }
  }

  prepareData(data) {
    if (!data || data.length === 0) {
      throw new Error('No data provided')
    }

    // Extract features and labels
    const features = []
    const labels = []
    
    for (const item of data) {
      const feature = this.extractFeatures(item)
      const label = this.encodeLabel(item.action || 'hold')
      
      features.push(feature)
      labels.push(label)
    }
    
    // Store feature names for later use
    if (this.featureNames.length === 0) {
      this.featureNames = Object.keys(data[0]).filter(key => 
        key !== 'action' && key !== 'timestamp' && typeof data[0][key] === 'number'
      )
    }
    
    return { X: features, y: labels }
  }

  extractFeatures(item) {
    const features = []
    
    // Price features
    features.push(item.price || 0)
    features.push(item.returns || 0)
    features.push(item.volatility || 0)
    
    // Technical indicators
    features.push(item.sma20 || 0)
    features.push(item.sma50 || 0)
    features.push(item.sma200 || 0)
    features.push(item.ema12 || 0)
    features.push(item.ema26 || 0)
    features.push(item.rsi || 0)
    features.push(item.atr || 0)
    
    // MACD
    features.push(item.macd || 0)
    features.push(item.macdSignal || 0)
    features.push(item.macdHistogram || 0)
    
    // Bollinger Bands
    features.push(item.bbUpper || 0)
    features.push(item.bbMiddle || 0)
    features.push(item.bbLower || 0)
    features.push(item.bbWidth || 0)
    
    // Stochastic
    features.push(item.stochK || 0)
    features.push(item.stochD || 0)
    
    // ADX
    features.push(item.adx || 0)
    
    // Volume
    features.push(item.volume || 0)
    features.push(item.obv || 0)
    features.push(item.volumeSma || 0)
    
    // Time features
    features.push(item.hour || 0)
    features.push(item.dayOfWeek || 0)
    features.push(item.month || 0)
    
    return features
  }

  encodeLabel(label) {
    if (!this.labelEncoder.has(label)) {
      this.labelEncoder.set(label, this.labelEncoder.size)
    }
    return this.labelEncoder.get(label)
  }

  decodeLabel(encoded) {
    for (const [label, code] of this.labelEncoder) {
      if (code === encoded) {
        return label
      }
    }
    return 'hold'
  }

  calculateAccuracy(trueLabels, predictions) {
    if (trueLabels.length !== predictions.length) {
      throw new Error('Label and prediction arrays must have the same length')
    }
    
    let correct = 0
    for (let i = 0; i < trueLabels.length; i++) {
      if (trueLabels[i] === predictions[i]) {
        correct++
      }
    }
    
    return correct / trueLabels.length
  }

  async predict(features) {
    if (!this.isTrained || !this.model) {
      throw new Error('Model must be trained before making predictions')
    }

    try {
      const featureArray = Array.isArray(features) ? features : this.extractFeatures(features)
      const prediction = this.model.predict([featureArray])[0]
      const decodedLabel = this.decodeLabel(prediction)
      
      // Calculate confidence based on prediction probabilities
      const probabilities = this.model.predictProbability([featureArray])[0]
      const confidence = Math.max(...probabilities)
      
      // Convert to score (-1 to 1)
      let score = 0
      if (decodedLabel === 'buy') {
        score = confidence
      } else if (decodedLabel === 'sell') {
        score = -confidence
      }
      
      return {
        action: decodedLabel,
        confidence: confidence,
        score: score,
        probabilities: {
          buy: probabilities[this.encodeLabel('buy')] || 0,
          sell: probabilities[this.encodeLabel('sell')] || 0,
          hold: probabilities[this.encodeLabel('hold')] || 0
        }
      }
    } catch (error) {
      throw new Error(`Random Forest prediction failed: ${error.message}`)
    }
  }

  async validate() {
    if (!this.isTrained) {
      throw new Error('Model must be trained before validation')
    }

    return {
      accuracy: this.accuracy,
      performance: this.accuracy * 100,
      modelType: 'RandomForest',
      features: this.featureNames.length,
      isTrained: this.isTrained
    }
  }

  getAccuracy() {
    return this.accuracy
  }

  async getMetrics() {
    return {
      accuracy: this.accuracy,
      performance: this.accuracy * 100,
      modelType: 'RandomForest',
      features: this.featureNames.length,
      isTrained: this.isTrained,
      config: this.config
    }
  }

  async save(filePath) {
    if (!this.isTrained || !this.model) {
      throw new Error('No trained model to save')
    }

    try {
      const modelData = {
        model: this.model.toJSON(),
        accuracy: this.accuracy,
        featureNames: this.featureNames,
        labelEncoder: Array.from(this.labelEncoder.entries()),
        config: this.config,
        isTrained: this.isTrained
      }
      
      await fs.writeJson(filePath, modelData, { spaces: 2 })
      return true
    } catch (error) {
      throw new Error(`Failed to save Random Forest model: ${error.message}`)
    }
  }

  async load(filePath) {
    try {
      const modelData = await fs.readJson(filePath)
      
      this.model = RandomForestClassifier.fromJSON(modelData.model)
      this.accuracy = modelData.accuracy
      this.featureNames = modelData.featureNames
      this.labelEncoder = new Map(modelData.labelEncoder)
      this.config = modelData.config
      this.isTrained = modelData.isTrained
      
      return true
    } catch (error) {
      throw new Error(`Failed to load Random Forest model: ${error.message}`)
    }
  }

  // Generate feature importance
  getFeatureImportance() {
    if (!this.isTrained || !this.model) {
      return null
    }

    try {
      const importance = this.model.featureImportance()
      const featureImportance = {}
      
      for (let i = 0; i < importance.length; i++) {
        const featureName = this.featureNames[i] || `feature_${i}`
        featureImportance[featureName] = importance[i]
      }
      
      return featureImportance
    } catch (error) {
      console.warn('Could not get feature importance:', error.message)
      return null
    }
  }

  // Get model summary
  getSummary() {
    return {
      modelType: 'Random Forest',
      accuracy: this.accuracy,
      features: this.featureNames.length,
      isTrained: this.isTrained,
      config: this.config,
      featureImportance: this.getFeatureImportance()
    }
  }
}

export { RandomForest }
export default RandomForest