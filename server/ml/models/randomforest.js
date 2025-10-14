import { Logger } from '../../utils/logger.js'
import { createClient } from 'redis'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class RandomForestModel {
  constructor(config = {}) {
    this.logger = new Logger()
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    })
    
    // Model configuration
    this.config = {
      n_estimators: config.n_estimators || 100,
      max_depth: config.max_depth || 10,
      min_samples_split: config.min_samples_split || 2,
      min_samples_leaf: config.min_samples_leaf || 1,
      max_features: config.max_features || 'sqrt',
      bootstrap: config.bootstrap || true,
      random_state: config.random_state || 42,
      ...config
    }
    
    // Model state
    this.isInitialized = false
    this.trees = []
    this.feature_importance = []
    this.feature_names = []
    this.trainingStep = 0
    
    // Performance metrics
    this.performance = {
      accuracy: 0,
      precision: 0,
      recall: 0,
      f1_score: 0,
      r2_score: 0,
      mse: 0,
      mae: 0
    }
    
    // Online learning parameters
    this.onlineLearning = {
      enabled: true,
      batch_size: 100,
      learning_rate: 0.01,
      retrain_threshold: 0.05,
      retrain_frequency: 50,
      adaptive_learning: true
    }
    
    // Training data buffer
    this.trainingBuffer = []
    this.maxBufferSize = 5000
    
    // Feature selection
    this.featureSelection = {
      enabled: true,
      max_features: 20,
      importance_threshold: 0.01
    }
  }

  async initialize() {
    try {
      await this.redis.connect()
      await this.initializeForest()
      await this.loadModel()
      this.isInitialized = true
      this.logger.info('Random Forest Model: Initialized successfully')
    } catch (error) {
      this.logger.error('Random Forest Model: Initialization failed', error)
      throw error
    }
  }

  async initializeForest() {
    this.trees = []
    
    for (let i = 0; i < this.config.n_estimators; i++) {
      this.trees.push({
        id: i,
        root: null,
        feature_importance: [],
        samples_count: 0,
        depth: 0
      })
    }
    
    this.logger.info(`Initialized ${this.config.n_estimators} decision trees`)
  }

  async train(X, y) {
    if (!this.isInitialized) {
      throw new Error('Model not initialized')
    }
    
    this.logger.info(`Training Random Forest with ${X.length} samples`)
    
    // Store feature names if not set
    if (this.feature_names.length === 0 && X.length > 0) {
      this.feature_names = Object.keys(X[0])
    }
    
    // Feature selection
    if (this.featureSelection.enabled) {
      await this.selectFeatures(X, y)
    }
    
    // Train each tree
    for (let i = 0; i < this.trees.length; i++) {
      await this.trainTree(this.trees[i], X, y, i)
    }
    
    // Calculate feature importance
    await this.calculateFeatureImportance()
    
    // Update performance metrics
    await this.updatePerformanceMetrics(X, y)
    
    this.trainingStep++
    
    this.logger.info('Random Forest training completed')
  }

  async trainTree(tree, X, y, treeIndex) {
    // Bootstrap sampling
    const n_samples = X.length
    const bootstrap_indices = this.bootstrapSample(n_samples)
    
    const X_bootstrap = bootstrap_indices.map(i => X[i])
    const y_bootstrap = bootstrap_indices.map(i => y[i])
    
    // Train tree on bootstrap sample
    tree.root = await this.buildTree(X_bootstrap, y_bootstrap, 0)
    tree.samples_count = X_bootstrap.length
    tree.depth = this.calculateTreeDepth(tree.root)
  }

  bootstrapSample(n_samples) {
    const indices = []
    for (let i = 0; i < n_samples; i++) {
      indices.push(Math.floor(Math.random() * n_samples))
    }
    return indices
  }

  async buildTree(X, y, depth) {
    // Base cases
    if (X.length === 0 || depth >= this.config.max_depth) {
      return this.createLeafNode(y)
    }
    
    if (X.length < this.config.min_samples_split) {
      return this.createLeafNode(y)
    }
    
    // Find best split
    const bestSplit = await this.findBestSplit(X, y)
    
    if (!bestSplit) {
      return this.createLeafNode(y)
    }
    
    // Split data
    const { leftX, leftY, rightX, rightY } = this.splitData(X, y, bestSplit)
    
    // Create internal node
    const node = {
      type: 'internal',
      feature: bestSplit.feature,
      threshold: bestSplit.threshold,
      left: null,
      right: null,
      samples: X.length,
      depth: depth
    }
    
    // Recursively build left and right subtrees
    node.left = await this.buildTree(leftX, leftY, depth + 1)
    node.right = await this.buildTree(rightX, rightY, depth + 1)
    
    return node
  }

  async findBestSplit(X, y) {
    const n_features = X.length > 0 ? Object.keys(X[0]).length : 0
    const max_features = this.getMaxFeatures(n_features)
    
    let bestSplit = null
    let bestGini = Infinity
    
    // Random feature selection
    const selectedFeatures = this.randomFeatureSelection(n_features, max_features)
    
    for (const feature of selectedFeatures) {
      const values = X.map(sample => sample[feature]).filter(val => val !== null && val !== undefined)
      const uniqueValues = [...new Set(values)].sort((a, b) => a - b)
      
      // Try different thresholds
      for (let i = 0; i < uniqueValues.length - 1; i++) {
        const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2
        
        const { leftY, rightY } = this.splitDataByThreshold(X, y, feature, threshold)
        
        if (leftY.length < this.config.min_samples_leaf || rightY.length < this.config.min_samples_leaf) {
          continue
        }
        
        const gini = this.calculateGini(leftY, rightY)
        
        if (gini < bestGini) {
          bestGini = gini
          bestSplit = {
            feature,
            threshold,
            gini
          }
        }
      }
    }
    
    return bestSplit
  }

  getMaxFeatures(n_features) {
    switch (this.config.max_features) {
      case 'sqrt':
        return Math.floor(Math.sqrt(n_features))
      case 'log2':
        return Math.floor(Math.log2(n_features))
      case 'auto':
        return n_features
      default:
        return Math.min(this.config.max_features, n_features)
    }
  }

  randomFeatureSelection(n_features, max_features) {
    const features = Array.from({ length: n_features }, (_, i) => i)
    const selected = []
    
    for (let i = 0; i < max_features; i++) {
      const randomIndex = Math.floor(Math.random() * features.length)
      selected.push(features[randomIndex])
      features.splice(randomIndex, 1)
    }
    
    return selected
  }

  splitDataByThreshold(X, y, feature, threshold) {
    const leftY = []
    const rightY = []
    
    for (let i = 0; i < X.length; i++) {
      if (X[i][feature] <= threshold) {
        leftY.push(y[i])
      } else {
        rightY.push(y[i])
      }
    }
    
    return { leftY, rightY }
  }

  splitData(X, y, split) {
    const leftX = []
    const leftY = []
    const rightX = []
    const rightY = []
    
    for (let i = 0; i < X.length; i++) {
      if (X[i][split.feature] <= split.threshold) {
        leftX.push(X[i])
        leftY.push(y[i])
      } else {
        rightX.push(X[i])
        rightY.push(y[i])
      }
    }
    
    return { leftX, leftY, rightX, rightY }
  }

  calculateGini(leftY, rightY) {
    const leftGini = this.calculateNodeGini(leftY)
    const rightGini = this.calculateNodeGini(rightY)
    
    const leftWeight = leftY.length / (leftY.length + rightY.length)
    const rightWeight = rightY.length / (leftY.length + rightY.length)
    
    return leftWeight * leftGini + rightWeight * rightGini
  }

  calculateNodeGini(y) {
    if (y.length === 0) return 0
    
    const classCounts = {}
    for (const label of y) {
      classCounts[label] = (classCounts[label] || 0) + 1
    }
    
    let gini = 1
    for (const count of Object.values(classCounts)) {
      const probability = count / y.length
      gini -= probability * probability
    }
    
    return gini
  }

  createLeafNode(y) {
    if (y.length === 0) {
      return {
        type: 'leaf',
        prediction: 0,
        samples: 0
      }
    }
    
    // For regression, return mean
    // For classification, return most common class
    const isRegression = typeof y[0] === 'number'
    
    if (isRegression) {
      const mean = y.reduce((sum, val) => sum + val, 0) / y.length
      return {
        type: 'leaf',
        prediction: mean,
        samples: y.length
      }
    } else {
      const classCounts = {}
      for (const label of y) {
        classCounts[label] = (classCounts[label] || 0) + 1
      }
      
      const mostCommonClass = Object.keys(classCounts).reduce((a, b) => 
        classCounts[a] > classCounts[b] ? a : b
      )
      
      return {
        type: 'leaf',
        prediction: mostCommonClass,
        samples: y.length
      }
    }
  }

  calculateTreeDepth(node) {
    if (node.type === 'leaf') {
      return 0
    }
    
    const leftDepth = node.left ? this.calculateTreeDepth(node.left) : 0
    const rightDepth = node.right ? this.calculateTreeDepth(node.right) : 0
    
    return 1 + Math.max(leftDepth, rightDepth)
  }

  async predict(X) {
    if (!this.isInitialized) {
      throw new Error('Model not initialized')
    }
    
    const predictions = []
    
    for (const sample of X) {
      const treePredictions = []
      
      for (const tree of this.trees) {
        const prediction = this.predictTree(tree.root, sample)
        treePredictions.push(prediction)
      }
      
      // Average predictions for regression, majority vote for classification
      const isRegression = typeof treePredictions[0] === 'number'
      
      if (isRegression) {
        const avg = treePredictions.reduce((sum, pred) => sum + pred, 0) / treePredictions.length
        predictions.push(avg)
      } else {
        const classCounts = {}
        for (const pred of treePredictions) {
          classCounts[pred] = (classCounts[pred] || 0) + 1
        }
        
        const mostCommonClass = Object.keys(classCounts).reduce((a, b) => 
          classCounts[a] > classCounts[b] ? a : b
        )
        
        predictions.push(mostCommonClass)
      }
    }
    
    return predictions
  }

  predictTree(node, sample) {
    if (node.type === 'leaf') {
      return node.prediction
    }
    
    if (sample[node.feature] <= node.threshold) {
      return this.predictTree(node.left, sample)
    } else {
      return this.predictTree(node.right, sample)
    }
  }

  async selectFeatures(X, y) {
    if (X.length === 0) return
    
    const featureNames = Object.keys(X[0])
    const featureScores = []
    
    // Calculate feature importance using mutual information
    for (const feature of featureNames) {
      const score = this.calculateMutualInformation(X, y, feature)
      featureScores.push({ feature, score })
    }
    
    // Sort by importance
    featureScores.sort((a, b) => b.score - a.score)
    
    // Select top features
    const selectedFeatures = featureScores
      .slice(0, this.featureSelection.max_features)
      .filter(f => f.score > this.featureSelection.importance_threshold)
      .map(f => f.feature)
    
    this.feature_names = selectedFeatures
    this.logger.info(`Selected ${selectedFeatures.length} features out of ${featureNames.length}`)
  }

  calculateMutualInformation(X, y, feature) {
    const values = X.map(sample => sample[feature])
    const uniqueValues = [...new Set(values)]
    
    let mutualInfo = 0
    
    for (const value of uniqueValues) {
      const valueIndices = values.map((v, i) => v === value ? i : -1).filter(i => i !== -1)
      const valueY = valueIndices.map(i => y[i])
      
      if (valueY.length === 0) continue
      
      const valueProb = valueY.length / y.length
      const valueEntropy = this.calculateEntropy(valueY)
      
      mutualInfo += valueProb * valueEntropy
    }
    
    return mutualInfo
  }

  calculateEntropy(y) {
    if (y.length === 0) return 0
    
    const classCounts = {}
    for (const label of y) {
      classCounts[label] = (classCounts[label] || 0) + 1
    }
    
    let entropy = 0
    for (const count of Object.values(classCounts)) {
      const probability = count / y.length
      if (probability > 0) {
        entropy -= probability * Math.log2(probability)
      }
    }
    
    return entropy
  }

  async calculateFeatureImportance() {
    this.feature_importance = []
    
    for (const tree of this.trees) {
      const treeImportance = this.calculateTreeFeatureImportance(tree.root)
      
      if (this.feature_importance.length === 0) {
        this.feature_importance = treeImportance
      } else {
        for (let i = 0; i < this.feature_importance.length; i++) {
          this.feature_importance[i] += treeImportance[i]
        }
      }
    }
    
    // Average across all trees
    for (let i = 0; i < this.feature_importance.length; i++) {
      this.feature_importance[i] /= this.trees.length
    }
  }

  calculateTreeFeatureImportance(node) {
    const importance = new Array(this.feature_names.length).fill(0)
    
    this.calculateNodeFeatureImportance(node, importance)
    
    return importance
  }

  calculateNodeFeatureImportance(node, importance) {
    if (node.type === 'leaf') return
    
    const featureIndex = this.feature_names.indexOf(node.feature)
    if (featureIndex !== -1) {
      importance[featureIndex] += node.samples
    }
    
    if (node.left) {
      this.calculateNodeFeatureImportance(node.left, importance)
    }
    
    if (node.right) {
      this.calculateNodeFeatureImportance(node.right, importance)
    }
  }

  async updatePerformanceMetrics(X, y) {
    try {
      const predictions = await this.predict(X)
      
      if (predictions.length === 0) return
      
      // Calculate accuracy (for classification)
      const isRegression = typeof y[0] === 'number'
      
      if (isRegression) {
        // Regression metrics
        const mse = predictions.reduce((sum, pred, i) => sum + Math.pow(pred - y[i], 2), 0) / predictions.length
        this.performance.mse = mse
        
        const mae = predictions.reduce((sum, pred, i) => sum + Math.abs(pred - y[i]), 0) / predictions.length
        this.performance.mae = mae
        
        const meanActual = y.reduce((sum, val) => sum + val, 0) / y.length
        const ssRes = predictions.reduce((sum, pred, i) => sum + Math.pow(pred - y[i], 2), 0)
        const ssTot = y.reduce((sum, val) => sum + Math.pow(val - meanActual, 2), 0)
        this.performance.r2_score = ssTot === 0 ? 0 : 1 - (ssRes / ssTot)
      } else {
        // Classification metrics
        let correct = 0
        const classCounts = {}
        const predictionCounts = {}
        
        for (let i = 0; i < predictions.length; i++) {
          if (predictions[i] === y[i]) {
            correct++
          }
          
          classCounts[y[i]] = (classCounts[y[i]] || 0) + 1
          predictionCounts[predictions[i]] = (predictionCounts[predictions[i]] || 0) + 1
        }
        
        this.performance.accuracy = correct / predictions.length
        
        // Calculate precision, recall, F1-score
        const classes = [...new Set([...Object.keys(classCounts), ...Object.keys(predictionCounts)])]
        let totalPrecision = 0
        let totalRecall = 0
        let totalF1 = 0
        
        for (const cls of classes) {
          const truePositives = predictions.filter((pred, i) => pred === cls && y[i] === cls).length
          const falsePositives = predictions.filter((pred, i) => pred === cls && y[i] !== cls).length
          const falseNegatives = predictions.filter((pred, i) => pred !== cls && y[i] === cls).length
          
          const precision = (truePositives + falsePositives) === 0 ? 0 : truePositives / (truePositives + falsePositives)
          const recall = (truePositives + falseNegatives) === 0 ? 0 : truePositives / (truePositives + falseNegatives)
          const f1 = (precision + recall) === 0 ? 0 : 2 * (precision * recall) / (precision + recall)
          
          totalPrecision += precision
          totalRecall += recall
          totalF1 += f1
        }
        
        this.performance.precision = totalPrecision / classes.length
        this.performance.recall = totalRecall / classes.length
        this.performance.f1_score = totalF1 / classes.length
      }
    } catch (error) {
      this.logger.error('Error updating performance metrics:', error)
    }
  }

  async continuousLearning() {
    if (!this.onlineLearning.enabled) return
    
    // Check if we need to retrain
    const shouldRetrain = this.shouldRetrain()
    
    if (shouldRetrain) {
      this.logger.info('Starting continuous learning retraining...')
      await this.retrain()
    }
    
    // Online learning
    if (this.trainingBuffer.length >= this.onlineLearning.batch_size) {
      await this.onlineLearningStep()
    }
  }

  shouldRetrain() {
    // Retrain if performance has dropped significantly
    if (this.performance.accuracy < this.onlineLearning.retrain_threshold) {
      return true
    }
    
    // Retrain at regular intervals
    if (this.trainingStep % this.onlineLearning.retrain_frequency === 0) {
      return true
    }
    
    return false
  }

  async retrain() {
    this.logger.info('Retraining Random Forest model...')
    
    if (this.trainingBuffer.length > 0) {
      const X = this.trainingBuffer.map(item => item.features)
      const y = this.trainingBuffer.map(item => item.target)
      
      await this.train(X, y)
    }
    
    this.logger.info('Random Forest model retraining completed')
  }

  async onlineLearningStep() {
    const batchSize = Math.min(this.onlineLearning.batch_size, this.trainingBuffer.length)
    const batch = this.trainingBuffer.slice(-batchSize)
    
    const X = batch.map(item => item.features)
    const y = batch.map(item => item.target)
    
    // Retrain a subset of trees
    const treesToRetrain = Math.floor(this.trees.length * 0.1) // Retrain 10% of trees
    
    for (let i = 0; i < treesToRetrain; i++) {
      const treeIndex = Math.floor(Math.random() * this.trees.length)
      await this.trainTree(this.trees[treeIndex], X, y, treeIndex)
    }
    
    // Update performance metrics
    await this.updatePerformanceMetrics(X, y)
    
    this.logger.info(`Online learning step completed: retrained ${treesToRetrain} trees`)
  }

  async addTrainingData(features, target) {
    this.trainingBuffer.push({ features, target })
    
    // Remove old data if buffer is full
    if (this.trainingBuffer.length > this.maxBufferSize) {
      this.trainingBuffer.shift()
    }
  }

  async saveModel() {
    try {
      const modelData = {
        trees: this.trees,
        feature_importance: this.feature_importance,
        feature_names: this.feature_names,
        config: this.config,
        trainingStep: this.trainingStep,
        performance: this.performance
      }
      
      const key = 'random_forest_model'
      await this.redis.setex(key, 86400, JSON.stringify(modelData))
      
      // Also save to file as backup
      const filePath = path.join(__dirname, '../../data/random_forest_model.json')
      await fs.ensureDir(path.dirname(filePath))
      await fs.writeJson(filePath, modelData)
      
      this.logger.info('Random Forest model saved successfully')
    } catch (error) {
      this.logger.error('Failed to save Random Forest model:', error)
    }
  }

  async loadModel() {
    try {
      const key = 'random_forest_model'
      const data = await this.redis.get(key)
      
      if (data) {
        const modelData = JSON.parse(data)
        
        this.trees = modelData.trees
        this.feature_importance = modelData.feature_importance
        this.feature_names = modelData.feature_names
        this.config = { ...this.config, ...modelData.config }
        this.trainingStep = modelData.trainingStep || 0
        this.performance = modelData.performance || this.performance
        
        this.logger.info('Random Forest model loaded successfully')
      }
    } catch (error) {
      this.logger.error('Failed to load Random Forest model:', error)
    }
  }

  async getModelStatus() {
    return {
      isInitialized: this.isInitialized,
      trainingStep: this.trainingStep,
      performance: this.performance,
      feature_importance: this.feature_importance,
      feature_names: this.feature_names,
      onlineLearning: this.onlineLearning.enabled,
      trainingBufferSize: this.trainingBuffer.length,
      treeCount: this.trees.length
    }
  }

  async cleanup() {
    try {
      await this.saveModel()
      await this.redis.quit()
      this.logger.info('Random Forest Model: Cleaned up successfully')
    } catch (error) {
      this.logger.error('Random Forest Model: Cleanup failed', error)
    }
  }
}