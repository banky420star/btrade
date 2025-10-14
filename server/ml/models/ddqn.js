import { Logger } from '../../utils/logger.js'
import { createClient } from 'redis'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class DDQNModel {
  constructor(config = {}) {
    this.logger = new Logger()
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    })
    
    // Model configuration
    this.config = {
      state_size: config.state_size || 50,
      action_size: config.action_size || 3, // Buy, Sell, Hold
      hidden_layers: config.hidden_layers || [128, 64, 32],
      learning_rate: config.learning_rate || 0.001,
      discount_factor: config.discount_factor || 0.95,
      epsilon: config.epsilon || 1.0,
      epsilon_min: config.epsilon_min || 0.01,
      epsilon_decay: config.epsilon_decay || 0.995,
      memory_size: config.memory_size || 10000,
      batch_size: config.batch_size || 32,
      target_update_frequency: config.target_update_frequency || 100,
      ...config
    }
    
    // Model state
    this.isInitialized = false
    this.trainingStep = 0
    this.episode = 0
    this.performance = {
      total_reward: 0,
      win_rate: 0,
      sharpe_ratio: 0,
      max_drawdown: 0,
      profit_factor: 0
    }
    
    // Neural network weights (simplified implementation)
    this.q_network = null
    this.target_network = null
    this.memory = []
    this.optimizer = null
    
    // Continuous learning parameters
    this.continuousLearning = {
      enabled: true,
      retrain_threshold: 0.1, // Retrain if performance drops by 10%
      retrain_frequency: 100, // Retrain every 100 episodes
      adaptive_learning_rate: true,
      learning_rate_decay: 0.999
    }
  }

  async initialize() {
    try {
      await this.redis.connect()
      await this.initializeNetworks()
      await this.loadModel()
      this.isInitialized = true
      this.logger.info('DDQN Model: Initialized successfully')
    } catch (error) {
      this.logger.error('DDQN Model: Initialization failed', error)
      throw error
    }
  }

  async initializeNetworks() {
    // Initialize Q-network and target network
    this.q_network = this.createNetwork()
    this.target_network = this.createNetwork()
    
    // Copy weights to target network
    this.updateTargetNetwork()
    
    this.logger.info('Neural networks initialized')
  }

  createNetwork() {
    // Simplified neural network implementation
    // In production, use a proper deep learning library like TensorFlow.js
    const layers = []
    
    // Input layer
    layers.push({
      type: 'dense',
      input_size: this.config.state_size,
      output_size: this.config.hidden_layers[0],
      weights: this.initializeWeights(this.config.state_size, this.config.hidden_layers[0]),
      biases: this.initializeBiases(this.config.hidden_layers[0])
    })
    
    // Hidden layers
    for (let i = 0; i < this.config.hidden_layers.length - 1; i++) {
      layers.push({
        type: 'dense',
        input_size: this.config.hidden_layers[i],
        output_size: this.config.hidden_layers[i + 1],
        weights: this.initializeWeights(this.config.hidden_layers[i], this.config.hidden_layers[i + 1]),
        biases: this.initializeBiases(this.config.hidden_layers[i + 1])
      })
    }
    
    // Output layer
    layers.push({
      type: 'dense',
      input_size: this.config.hidden_layers[this.config.hidden_layers.length - 1],
      output_size: this.config.action_size,
      weights: this.initializeWeights(this.config.hidden_layers[this.config.hidden_layers.length - 1], this.config.action_size),
      biases: this.initializeBiases(this.config.action_size)
    })
    
    return { layers }
  }

  initializeWeights(inputSize, outputSize) {
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

  initializeBiases(size) {
    const biases = []
    for (let i = 0; i < size; i++) {
      biases[i] = 0
    }
    return biases
  }

  forwardPass(network, input) {
    let current = [...input]
    
    for (const layer of network.layers) {
      const output = []
      
      for (let i = 0; i < layer.output_size; i++) {
        let sum = layer.biases[i]
        
        for (let j = 0; j < layer.input_size; j++) {
          sum += current[j] * layer.weights[j][i]
        }
        
        // ReLU activation for hidden layers, linear for output
        if (layer.type === 'dense' && layer.output_size !== this.config.action_size) {
          output[i] = Math.max(0, sum)
        } else {
          output[i] = sum
        }
      }
      
      current = output
    }
    
    return current
  }

  async predict(state) {
    if (!this.isInitialized) {
      throw new Error('Model not initialized')
    }
    
    const q_values = this.forwardPass(this.q_network, state)
    return q_values
  }

  async getAction(state, training = true) {
    const q_values = await this.predict(state)
    
    if (training && Math.random() < this.config.epsilon) {
      // Epsilon-greedy exploration
      return Math.floor(Math.random() * this.config.action_size)
    } else {
      // Exploitation
      return q_values.indexOf(Math.max(...q_values))
    }
  }

  async trainStep(state, action, reward, next_state, done) {
    // Store experience in replay buffer
    this.memory.push({
      state: [...state],
      action,
      reward,
      next_state: [...next_state],
      done
    })
    
    // Remove old experiences if memory is full
    if (this.memory.length > this.config.memory_size) {
      this.memory.shift()
    }
    
    // Train if we have enough experiences
    if (this.memory.length >= this.config.batch_size) {
      await this.replay()
    }
    
    // Update target network periodically
    if (this.trainingStep % this.config.target_update_frequency === 0) {
      this.updateTargetNetwork()
    }
    
    this.trainingStep++
    
    // Decay epsilon
    if (this.config.epsilon > this.config.epsilon_min) {
      this.config.epsilon *= this.config.epsilon_decay
    }
  }

  async replay() {
    // Sample random batch from memory
    const batch = this.sampleBatch()
    
    const states = batch.map(exp => exp.state)
    const actions = batch.map(exp => exp.action)
    const rewards = batch.map(exp => exp.reward)
    const next_states = batch.map(exp => exp.next_state)
    const dones = batch.map(exp => exp.done)
    
    // Calculate target Q-values using Double DQN
    const target_q_values = []
    
    for (let i = 0; i < batch.length; i++) {
      const current_q_values = this.forwardPass(this.q_network, states[i])
      const next_q_values = this.forwardPass(this.q_network, next_states[i])
      const next_target_q_values = this.forwardPass(this.target_network, next_states[i])
      
      // Double DQN: use main network to select action, target network to evaluate
      const best_action = next_q_values.indexOf(Math.max(...next_q_values))
      const target_q = dones[i] ? rewards[i] : rewards[i] + this.config.discount_factor * next_target_q_values[best_action]
      
      target_q_values.push(target_q)
    }
    
    // Update Q-network using gradient descent
    await this.updateQNetwork(states, actions, target_q_values)
  }

  sampleBatch() {
    const batch = []
    const batchSize = Math.min(this.config.batch_size, this.memory.length)
    
    for (let i = 0; i < batchSize; i++) {
      const randomIndex = Math.floor(Math.random() * this.memory.length)
      batch.push(this.memory[randomIndex])
    }
    
    return batch
  }

  async updateQNetwork(states, actions, target_q_values) {
    // Simplified gradient descent update
    // In production, implement proper backpropagation
    
    for (let i = 0; i < states.length; i++) {
      const state = states[i]
      const action = actions[i]
      const target = target_q_values[i]
      
      // Forward pass to get current Q-values
      const current_q_values = this.forwardPass(this.q_network, state)
      const current_q = current_q_values[action]
      
      // Calculate error
      const error = target - current_q
      
      // Update weights using simple gradient descent
      this.updateWeights(this.q_network, state, action, error)
    }
  }

  updateWeights(network, state, action, error) {
    // Simplified weight update
    // In production, implement proper backpropagation
    
    const learning_rate = this.continuousLearning.adaptive_learning_rate ? 
      this.config.learning_rate * Math.pow(this.continuousLearning.learning_rate_decay, this.trainingStep) :
      this.config.learning_rate
    
    // Update weights for the action that was taken
    for (let layer_idx = 0; layer_idx < network.layers.length; layer_idx++) {
      const layer = network.layers[layer_idx]
      
      if (layer_idx === network.layers.length - 1) {
        // Output layer - only update the specific action
        layer.biases[action] += learning_rate * error
        
        for (let i = 0; i < layer.input_size; i++) {
          layer.weights[i][action] += learning_rate * error * state[i]
        }
      } else {
        // Hidden layers - update all weights
        for (let i = 0; i < layer.output_size; i++) {
          layer.biases[i] += learning_rate * error * 0.1
          
          for (let j = 0; j < layer.input_size; j++) {
            layer.weights[j][i] += learning_rate * error * state[j] * 0.1
          }
        }
      }
    }
  }

  updateTargetNetwork() {
    // Copy weights from Q-network to target network
    for (let i = 0; i < this.q_network.layers.length; i++) {
      this.target_network.layers[i].weights = JSON.parse(JSON.stringify(this.q_network.layers[i].weights))
      this.target_network.layers[i].biases = JSON.parse(JSON.stringify(this.q_network.layers[i].biases))
    }
    
    this.logger.info('Target network updated')
  }

  async continuousLearning() {
    if (!this.continuousLearning.enabled) return
    
    // Check if we need to retrain
    const shouldRetrain = this.shouldRetrain()
    
    if (shouldRetrain) {
      this.logger.info('Starting continuous learning retraining...')
      await this.retrain()
    }
    
    // Update learning rate if adaptive
    if (this.continuousLearning.adaptive_learning_rate) {
      this.config.learning_rate *= this.continuousLearning.learning_rate_decay
    }
  }

  shouldRetrain() {
    // Retrain if performance has dropped significantly
    if (this.performance.sharpe_ratio < this.continuousLearning.retrain_threshold) {
      return true
    }
    
    // Retrain at regular intervals
    if (this.episode % this.continuousLearning.retrain_frequency === 0) {
      return true
    }
    
    return false
  }

  async retrain() {
    // Implement retraining logic
    this.logger.info('Retraining DDQN model...')
    
    // Reset epsilon for exploration
    this.config.epsilon = Math.max(this.config.epsilon_min, this.config.epsilon * 1.5)
    
    // Clear old memory
    this.memory = this.memory.slice(-this.config.memory_size / 2)
    
    // Update performance metrics
    await this.updatePerformanceMetrics()
    
    this.logger.info('DDQN model retraining completed')
  }

  async updatePerformanceMetrics() {
    // Calculate performance metrics
    const recentRewards = this.memory.slice(-100).map(exp => exp.reward)
    
    if (recentRewards.length > 0) {
      this.performance.total_reward = recentRewards.reduce((a, b) => a + b, 0)
      this.performance.win_rate = recentRewards.filter(r => r > 0).length / recentRewards.length
      
      // Calculate Sharpe ratio
      const mean = this.performance.total_reward / recentRewards.length
      const variance = recentRewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / recentRewards.length
      const std = Math.sqrt(variance)
      this.performance.sharpe_ratio = std === 0 ? 0 : mean / std
      
      // Calculate max drawdown
      this.performance.max_drawdown = this.calculateMaxDrawdown(recentRewards)
      
      // Calculate profit factor
      const profits = recentRewards.filter(r => r > 0)
      const losses = recentRewards.filter(r => r < 0)
      const totalProfit = profits.reduce((a, b) => a + b, 0)
      const totalLoss = Math.abs(losses.reduce((a, b) => a + b, 0))
      this.performance.profit_factor = totalLoss === 0 ? Infinity : totalProfit / totalLoss
    }
  }

  calculateMaxDrawdown(rewards) {
    let maxDrawdown = 0
    let peak = 0
    let runningSum = 0
    
    for (const reward of rewards) {
      runningSum += reward
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

  async saveModel() {
    try {
      const modelData = {
        q_network: this.q_network,
        target_network: this.target_network,
        config: this.config,
        trainingStep: this.trainingStep,
        episode: this.episode,
        performance: this.performance,
        memory: this.memory.slice(-1000) // Save last 1000 experiences
      }
      
      const key = 'ddqn_model'
      await this.redis.setex(key, 86400, JSON.stringify(modelData))
      
      // Also save to file as backup
      const filePath = path.join(__dirname, '../../data/ddqn_model.json')
      await fs.ensureDir(path.dirname(filePath))
      await fs.writeJson(filePath, modelData)
      
      this.logger.info('DDQN model saved successfully')
    } catch (error) {
      this.logger.error('Failed to save DDQN model:', error)
    }
  }

  async loadModel() {
    try {
      const key = 'ddqn_model'
      const data = await this.redis.get(key)
      
      if (data) {
        const modelData = JSON.parse(data)
        
        this.q_network = modelData.q_network
        this.target_network = modelData.target_network
        this.config = { ...this.config, ...modelData.config }
        this.trainingStep = modelData.trainingStep || 0
        this.episode = modelData.episode || 0
        this.performance = modelData.performance || this.performance
        this.memory = modelData.memory || []
        
        this.logger.info('DDQN model loaded successfully')
      }
    } catch (error) {
      this.logger.error('Failed to load DDQN model:', error)
    }
  }

  async getModelStatus() {
    return {
      isInitialized: this.isInitialized,
      trainingStep: this.trainingStep,
      episode: this.episode,
      epsilon: this.config.epsilon,
      memorySize: this.memory.length,
      performance: this.performance,
      continuousLearning: this.continuousLearning.enabled
    }
  }

  async cleanup() {
    try {
      await this.saveModel()
      await this.redis.quit()
      this.logger.info('DDQN Model: Cleaned up successfully')
    } catch (error) {
      this.logger.error('DDQN Model: Cleanup failed', error)
    }
  }
}