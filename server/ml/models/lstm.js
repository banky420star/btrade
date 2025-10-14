import { Logger } from '../../utils/logger.js'
import { createClient } from 'redis'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class LSTMModel {
  constructor(config = {}) {
    this.logger = new Logger()
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    })
    
    // Model configuration
    this.config = {
      sequence_length: config.sequence_length || 60,
      feature_count: config.feature_count || 50,
      hidden_size: config.hidden_size || 128,
      num_layers: config.num_layers || 2,
      dropout: config.dropout || 0.2,
      learning_rate: config.learning_rate || 0.001,
      batch_size: config.batch_size || 32,
      epochs: config.epochs || 100,
      early_stopping_patience: config.early_stopping_patience || 10,
      ...config
    }
    
    // Model state
    this.isInitialized = false
    this.trainingStep = 0
    this.epoch = 0
    this.bestLoss = Infinity
    this.patienceCounter = 0
    
    // Performance metrics
    this.performance = {
      mse: 0,
      mae: 0,
      mape: 0,
      r2_score: 0,
      sharpe_ratio: 0,
      max_drawdown: 0
    }
    
    // LSTM network weights
    this.lstm_weights = null
    this.attention_weights = null
    this.output_weights = null
    this.biases = null
    
    // Continuous learning parameters
    this.continuousLearning = {
      enabled: true,
      retrain_threshold: 0.05, // Retrain if performance drops by 5%
      retrain_frequency: 50, // Retrain every 50 epochs
      adaptive_learning_rate: true,
      learning_rate_decay: 0.99,
      online_learning: true,
      online_learning_rate: 0.0001
    }
    
    // Training data buffer
    this.trainingBuffer = []
    this.maxBufferSize = 10000
  }

  async initialize() {
    try {
      await this.redis.connect()
      await this.initializeNetwork()
      await this.loadModel()
      this.isInitialized = true
      this.logger.info('LSTM Model: Initialized successfully')
    } catch (error) {
      this.logger.error('LSTM Model: Initialization failed', error)
      throw error
    }
  }

  async initializeNetwork() {
    // Initialize LSTM weights
    this.lstm_weights = this.initializeLSTMWeights()
    
    // Initialize attention weights
    this.attention_weights = this.initializeAttentionWeights()
    
    // Initialize output layer weights
    this.output_weights = this.initializeOutputWeights()
    
    // Initialize biases
    this.biases = this.initializeBiases()
    
    this.logger.info('LSTM network initialized')
  }

  initializeLSTMWeights() {
    const weights = {}
    
    // Input gate weights
    weights.W_xi = this.xavierInit(this.config.feature_count, this.config.hidden_size)
    weights.W_hi = this.xavierInit(this.config.hidden_size, this.config.hidden_size)
    weights.b_i = this.zerosInit(this.config.hidden_size)
    
    // Forget gate weights
    weights.W_xf = this.xavierInit(this.config.feature_count, this.config.hidden_size)
    weights.W_hf = this.xavierInit(this.config.hidden_size, this.config.hidden_size)
    weights.b_f = this.onesInit(this.config.hidden_size) // Initialize to 1 for forget gate
    
    // Output gate weights
    weights.W_xo = this.xavierInit(this.config.feature_count, this.config.hidden_size)
    weights.W_ho = this.xavierInit(this.config.hidden_size, this.config.hidden_size)
    weights.b_o = this.zerosInit(this.config.hidden_size)
    
    // Cell state weights
    weights.W_xc = this.xavierInit(this.config.feature_count, this.config.hidden_size)
    weights.W_hc = this.xavierInit(this.config.hidden_size, this.config.hidden_size)
    weights.b_c = this.zerosInit(this.config.hidden_size)
    
    return weights
  }

  initializeAttentionWeights() {
    const weights = {}
    
    // Attention mechanism weights
    weights.W_a = this.xavierInit(this.config.hidden_size, this.config.hidden_size)
    weights.W_v = this.xavierInit(this.config.hidden_size, 1)
    weights.b_a = this.zerosInit(this.config.hidden_size)
    
    return weights
  }

  initializeOutputWeights() {
    const weights = {}
    
    // Output layer weights
    weights.W_out = this.xavierInit(this.config.hidden_size, 1)
    weights.b_out = this.zerosInit(1)
    
    return weights
  }

  initializeBiases() {
    return {
      lstm: this.zerosInit(this.config.hidden_size),
      attention: this.zerosInit(this.config.hidden_size),
      output: this.zerosInit(1)
    }
  }

  xavierInit(inputSize, outputSize) {
    const weights = []
    const xavier = Math.sqrt(2.0 / (inputSize + outputSize))
    
    for (let i = 0; i < inputSize; i++) {
      weights[i] = []
      for (let j = 0; j < outputSize; j++) {
        weights[i][j] = (Math.random() - 0.5) * 2 * xavier
      }
    }
    
    return weights
  }

  zerosInit(size) {
    const arr = []
    for (let i = 0; i < size; i++) {
      arr[i] = 0
    }
    return arr
  }

  onesInit(size) {
    const arr = []
    for (let i = 0; i < size; i++) {
      arr[i] = 1
    }
    return arr
  }

  async predict(sequence) {
    if (!this.isInitialized) {
      throw new Error('Model not initialized')
    }
    
    if (sequence.length !== this.config.sequence_length) {
      throw new Error(`Sequence length must be ${this.config.sequence_length}`)
    }
    
    // Forward pass through LSTM
    const lstm_outputs = this.forwardLSTM(sequence)
    
    // Apply attention mechanism
    const attention_output = this.applyAttention(lstm_outputs)
    
    // Generate prediction
    const prediction = this.generatePrediction(attention_output)
    
    return prediction
  }

  forwardLSTM(sequence) {
    const outputs = []
    let h_prev = this.zerosInit(this.config.hidden_size)
    let c_prev = this.zerosInit(this.config.hidden_size)
    
    for (let t = 0; t < sequence.length; t++) {
      const x_t = sequence[t]
      
      // Input gate
      const i_t = this.sigmoid(
        this.addVectors(
          this.matrixVectorMultiply(this.lstm_weights.W_xi, x_t),
          this.matrixVectorMultiply(this.lstm_weights.W_hi, h_prev),
          this.lstm_weights.b_i
        )
      )
      
      // Forget gate
      const f_t = this.sigmoid(
        this.addVectors(
          this.matrixVectorMultiply(this.lstm_weights.W_xf, x_t),
          this.matrixVectorMultiply(this.lstm_weights.W_hf, h_prev),
          this.lstm_weights.b_f
        )
      )
      
      // Output gate
      const o_t = this.sigmoid(
        this.addVectors(
          this.matrixVectorMultiply(this.lstm_weights.W_xo, x_t),
          this.matrixVectorMultiply(this.lstm_weights.W_ho, h_prev),
          this.lstm_weights.b_o
        )
      )
      
      // Cell state
      const c_tilde = this.tanh(
        this.addVectors(
          this.matrixVectorMultiply(this.lstm_weights.W_xc, x_t),
          this.matrixVectorMultiply(this.lstm_weights.W_hc, h_prev),
          this.lstm_weights.b_c
        )
      )
      
      const c_t = this.addVectors(
        this.elementWiseMultiply(f_t, c_prev),
        this.elementWiseMultiply(i_t, c_tilde)
      )
      
      // Hidden state
      const h_t = this.elementWiseMultiply(o_t, this.tanh(c_t))
      
      outputs.push(h_t)
      h_prev = h_t
      c_prev = c_t
    }
    
    return outputs
  }

  applyAttention(lstm_outputs) {
    // Calculate attention scores
    const attention_scores = []
    
    for (let t = 0; t < lstm_outputs.length; t++) {
      const score = this.matrixVectorMultiply(
        this.lstm_weights.W_a,
        this.addVectors(
          lstm_outputs[t],
          this.attention_weights.b_a
        )
      )[0]
      attention_scores.push(score)
    }
    
    // Apply softmax to get attention weights
    const attention_weights = this.softmax(attention_scores)
    
    // Calculate weighted sum
    const context_vector = this.zerosInit(this.config.hidden_size)
    
    for (let t = 0; t < lstm_outputs.length; t++) {
      const weighted_output = this.scalarMultiply(attention_weights[t], lstm_outputs[t])
      for (let i = 0; i < this.config.hidden_size; i++) {
        context_vector[i] += weighted_output[i]
      }
    }
    
    return context_vector
  }

  generatePrediction(attention_output) {
    const prediction = this.matrixVectorMultiply(
      this.output_weights.W_out,
      attention_output
    )[0] + this.output_weights.b_out[0]
    
    return prediction
  }

  async train(sequences, targets) {
    if (!this.isInitialized) {
      throw new Error('Model not initialized')
    }
    
    this.logger.info(`Training LSTM model with ${sequences.length} sequences`)
    
    const learning_rate = this.continuousLearning.adaptive_learning_rate ?
      this.config.learning_rate * Math.pow(this.continuousLearning.learning_rate_decay, this.epoch) :
      this.config.learning_rate
    
    let totalLoss = 0
    const batchSize = Math.min(this.config.batch_size, sequences.length)
    
    for (let i = 0; i < sequences.length; i += batchSize) {
      const batchSequences = sequences.slice(i, i + batchSize)
      const batchTargets = targets.slice(i, i + batchSize)
      
      const batchLoss = await this.trainBatch(batchSequences, batchTargets, learning_rate)
      totalLoss += batchLoss
    }
    
    const avgLoss = totalLoss / Math.ceil(sequences.length / batchSize)
    
    // Update performance metrics
    await this.updatePerformanceMetrics(sequences, targets)
    
    // Check for early stopping
    if (avgLoss < this.bestLoss) {
      this.bestLoss = avgLoss
      this.patienceCounter = 0
    } else {
      this.patienceCounter++
    }
    
    this.epoch++
    this.trainingStep++
    
    this.logger.info(`Epoch ${this.epoch}: Loss = ${avgLoss.toFixed(6)}`)
    
    return avgLoss
  }

  async trainBatch(sequences, targets, learning_rate) {
    let totalLoss = 0
    
    for (let i = 0; i < sequences.length; i++) {
      const sequence = sequences[i]
      const target = targets[i]
      
      // Forward pass
      const prediction = await this.predict(sequence)
      
      // Calculate loss
      const loss = Math.pow(prediction - target, 2)
      totalLoss += loss
      
      // Backward pass (simplified gradient descent)
      await this.backwardPass(sequence, target, prediction, learning_rate)
    }
    
    return totalLoss / sequences.length
  }

  async backwardPass(sequence, target, prediction, learning_rate) {
    // Simplified backpropagation
    // In production, implement proper backpropagation through time
    
    const error = prediction - target
    
    // Update output weights
    for (let i = 0; i < this.config.hidden_size; i++) {
      this.output_weights.W_out[i][0] -= learning_rate * error * sequence[sequence.length - 1][i]
    }
    this.output_weights.b_out[0] -= learning_rate * error
    
    // Update LSTM weights (simplified)
    for (const weightName of Object.keys(this.lstm_weights)) {
      if (weightName.startsWith('W_')) {
        const weights = this.lstm_weights[weightName]
        for (let i = 0; i < weights.length; i++) {
          for (let j = 0; j < weights[i].length; j++) {
            weights[i][j] -= learning_rate * error * 0.01
          }
        }
      } else if (weightName.startsWith('b_')) {
        const biases = this.lstm_weights[weightName]
        for (let i = 0; i < biases.length; i++) {
          biases[i] -= learning_rate * error * 0.01
        }
      }
    }
  }

  async updatePerformanceMetrics(sequences, targets) {
    const predictions = []
    const actuals = []
    
    for (let i = 0; i < sequences.length; i++) {
      try {
        const prediction = await this.predict(sequences[i])
        predictions.push(prediction)
        actuals.push(targets[i])
      } catch (error) {
        this.logger.error('Error in performance calculation:', error)
      }
    }
    
    if (predictions.length > 0) {
      // Calculate MSE
      const mse = predictions.reduce((sum, pred, i) => sum + Math.pow(pred - actuals[i], 2), 0) / predictions.length
      this.performance.mse = mse
      
      // Calculate MAE
      const mae = predictions.reduce((sum, pred, i) => sum + Math.abs(pred - actuals[i]), 0) / predictions.length
      this.performance.mae = mae
      
      // Calculate MAPE
      const mape = predictions.reduce((sum, pred, i) => {
        if (actuals[i] !== 0) {
          return sum + Math.abs((pred - actuals[i]) / actuals[i])
        }
        return sum
      }, 0) / predictions.length * 100
      this.performance.mape = mape
      
      // Calculate R² score
      const meanActual = actuals.reduce((sum, val) => sum + val, 0) / actuals.length
      const ssRes = predictions.reduce((sum, pred, i) => sum + Math.pow(pred - actuals[i], 2), 0)
      const ssTot = actuals.reduce((sum, val) => sum + Math.pow(val - meanActual, 2), 0)
      this.performance.r2_score = ssTot === 0 ? 0 : 1 - (ssRes / ssTot)
      
      // Calculate Sharpe ratio
      const returns = predictions.map((pred, i) => pred - actuals[i])
      const meanReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length
      const returnStd = Math.sqrt(returns.reduce((sum, ret) => sum + Math.pow(ret - meanReturn, 2), 0) / returns.length)
      this.performance.sharpe_ratio = returnStd === 0 ? 0 : meanReturn / returnStd
      
      // Calculate max drawdown
      this.performance.max_drawdown = this.calculateMaxDrawdown(returns)
    }
  }

  calculateMaxDrawdown(returns) {
    let maxDrawdown = 0
    let peak = 0
    let runningSum = 0
    
    for (const ret of returns) {
      runningSum += ret
      if (runningSum > peak) {
        peak = runningSum
      }
      const drawdown = peak - runningSum
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown
      }
    }
    
    return maxDrawdown
  }

  async continuousLearning() {
    if (!this.continuousLearning.enabled) return
    
    // Check if we need to retrain
    const shouldRetrain = this.shouldRetrain()
    
    if (shouldRetrain) {
      this.logger.info('Starting continuous learning retraining...')
      await this.retrain()
    }
    
    // Online learning
    if (this.continuousLearning.online_learning && this.trainingBuffer.length > 0) {
      await this.onlineLearning()
    }
  }

  shouldRetrain() {
    // Retrain if performance has dropped significantly
    if (this.performance.r2_score < this.continuousLearning.retrain_threshold) {
      return true
    }
    
    // Retrain at regular intervals
    if (this.epoch % this.continuousLearning.retrain_frequency === 0) {
      return true
    }
    
    // Retrain if early stopping patience exceeded
    if (this.patienceCounter >= this.config.early_stopping_patience) {
      return true
    }
    
    return false
  }

  async retrain() {
    this.logger.info('Retraining LSTM model...')
    
    // Reset early stopping
    this.patienceCounter = 0
    this.bestLoss = Infinity
    
    // Use training buffer for retraining
    if (this.trainingBuffer.length > 0) {
      const sequences = this.trainingBuffer.map(item => item.sequence)
      const targets = this.trainingBuffer.map(item => item.target)
      
      await this.train(sequences, targets)
    }
    
    this.logger.info('LSTM model retraining completed')
  }

  async onlineLearning() {
    if (this.trainingBuffer.length < 10) return
    
    const learning_rate = this.continuousLearning.online_learning_rate
    
    // Sample a small batch for online learning
    const batchSize = Math.min(10, this.trainingBuffer.length)
    const batch = this.trainingBuffer.slice(-batchSize)
    
    for (const item of batch) {
      try {
        const prediction = await this.predict(item.sequence)
        const error = prediction - item.target
        
        // Update weights with small learning rate
        await this.backwardPass(item.sequence, item.target, prediction, learning_rate)
      } catch (error) {
        this.logger.error('Error in online learning:', error)
      }
    }
  }

  async addTrainingData(sequence, target) {
    if (sequence.length !== this.config.sequence_length) {
      this.logger.warn(`Invalid sequence length: ${sequence.length}, expected ${this.config.sequence_length}`)
      return
    }
    
    this.trainingBuffer.push({ sequence, target })
    
    // Remove old data if buffer is full
    if (this.trainingBuffer.length > this.maxBufferSize) {
      this.trainingBuffer.shift()
    }
  }

  // Utility functions
  sigmoid(x) {
    if (Array.isArray(x)) {
      return x.map(val => 1 / (1 + Math.exp(-val)))
    }
    return 1 / (1 + Math.exp(-x))
  }

  tanh(x) {
    if (Array.isArray(x)) {
      return x.map(val => Math.tanh(val))
    }
    return Math.tanh(x)
  }

  softmax(x) {
    const max = Math.max(...x)
    const exp = x.map(val => Math.exp(val - max))
    const sum = exp.reduce((a, b) => a + b, 0)
    return exp.map(val => val / sum)
  }

  addVectors(a, b, c = null) {
    const result = []
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] + b[i]
      if (c) result[i] += c[i]
    }
    return result
  }

  matrixVectorMultiply(matrix, vector) {
    const result = []
    for (let i = 0; i < matrix[0].length; i++) {
      let sum = 0
      for (let j = 0; j < matrix.length; j++) {
        sum += matrix[j][i] * vector[j]
      }
      result[i] = sum
    }
    return result
  }

  elementWiseMultiply(a, b) {
    const result = []
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] * b[i]
    }
    return result
  }

  scalarMultiply(scalar, vector) {
    return vector.map(val => val * scalar)
  }

  async saveModel() {
    try {
      const modelData = {
        lstm_weights: this.lstm_weights,
        attention_weights: this.attention_weights,
        output_weights: this.output_weights,
        biases: this.biases,
        config: this.config,
        trainingStep: this.trainingStep,
        epoch: this.epoch,
        performance: this.performance,
        bestLoss: this.bestLoss
      }
      
      const key = 'lstm_model'
      await this.redis.setex(key, 86400, JSON.stringify(modelData))
      
      // Also save to file as backup
      const filePath = path.join(__dirname, '../../data/lstm_model.json')
      await fs.ensureDir(path.dirname(filePath))
      await fs.writeJson(filePath, modelData)
      
      this.logger.info('LSTM model saved successfully')
    } catch (error) {
      this.logger.error('Failed to save LSTM model:', error)
    }
  }

  async loadModel() {
    try {
      const key = 'lstm_model'
      const data = await this.redis.get(key)
      
      if (data) {
        const modelData = JSON.parse(data)
        
        this.lstm_weights = modelData.lstm_weights
        this.attention_weights = modelData.attention_weights
        this.output_weights = modelData.output_weights
        this.biases = modelData.biases
        this.config = { ...this.config, ...modelData.config }
        this.trainingStep = modelData.trainingStep || 0
        this.epoch = modelData.epoch || 0
        this.performance = modelData.performance || this.performance
        this.bestLoss = modelData.bestLoss || Infinity
        
        this.logger.info('LSTM model loaded successfully')
      }
    } catch (error) {
      this.logger.error('Failed to load LSTM model:', error)
    }
  }

  async getModelStatus() {
    return {
      isInitialized: this.isInitialized,
      trainingStep: this.trainingStep,
      epoch: this.epoch,
      bestLoss: this.bestLoss,
      performance: this.performance,
      continuousLearning: this.continuousLearning.enabled,
      trainingBufferSize: this.trainingBuffer.length
    }
  }

  async cleanup() {
    try {
      await this.saveModel()
      await this.redis.quit()
      this.logger.info('LSTM Model: Cleaned up successfully')
    } catch (error) {
      this.logger.error('LSTM Model: Cleanup failed', error)
    }
  }
}