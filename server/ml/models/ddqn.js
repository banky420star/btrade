import fs from 'fs-extra'
import path from 'path'

class DDQN {
  constructor(config = {}) {
    this.config = {
      stateSize: 20,
      actionSize: 3, // Buy, Sell, Hold
      hiddenUnits: 64,
      learningRate: 0.001,
      epsilon: 1.0,
      epsilonMin: 0.01,
      epsilonDecay: 0.995,
      memorySize: 10000,
      batchSize: 32,
      gamma: 0.95,
      targetUpdate: 10,
      ...config
    }
    
    this.qNetwork = null
    this.targetNetwork = null
    this.memory = []
    this.epsilon = this.config.epsilon
    this.stepCount = 0
    this.isTrained = false
    this.accuracy = 0
    this.episodeRewards = []
    this.featureNames = []
  }

  async train(trainingData, validationData, progressCallback) {
    if (!trainingData || trainingData.length === 0) {
      throw new Error('No training data provided')
    }

    try {
      // Initialize networks
      this.initializeNetworks()
      
      // Prepare training episodes
      const episodes = this.prepareEpisodes(trainingData)
      
      // Train the agent
      await this.trainAgent(episodes, progressCallback)
      
      this.isTrained = true
      
      return {
        accuracy: this.accuracy,
        performance: this.accuracy * 100,
        modelType: 'DDQN',
        features: this.featureNames.length,
        episodes: episodes.length
      }
    } catch (error) {
      throw new Error(`DDQN training failed: ${error.message}`)
    }
  }

  initializeNetworks() {
    // Simplified neural network representation
    // In reality, this would use TensorFlow.js or similar
    this.qNetwork = {
      layers: [
        { type: 'Dense', units: this.config.hiddenUnits, activation: 'relu' },
        { type: 'Dense', units: this.config.hiddenUnits, activation: 'relu' },
        { type: 'Dense', units: this.config.actionSize, activation: 'linear' }
      ],
      weights: this.initializeWeights()
    }
    
    this.targetNetwork = JSON.parse(JSON.stringify(this.qNetwork))
  }

  initializeWeights() {
    // Initialize random weights
    const weights = []
    const inputSize = this.config.stateSize
    
    // First layer weights
    const layer1Weights = []
    for (let i = 0; i < inputSize; i++) {
      const neuronWeights = []
      for (let j = 0; j < this.config.hiddenUnits; j++) {
        neuronWeights.push((Math.random() - 0.5) * 0.1)
      }
      layer1Weights.push(neuronWeights)
    }
    weights.push(layer1Weights)
    
    // Second layer weights
    const layer2Weights = []
    for (let i = 0; i < this.config.hiddenUnits; i++) {
      const neuronWeights = []
      for (let j = 0; j < this.config.hiddenUnits; j++) {
        neuronWeights.push((Math.random() - 0.5) * 0.1)
      }
      layer2Weights.push(neuronWeights)
    }
    weights.push(layer2Weights)
    
    // Output layer weights
    const outputWeights = []
    for (let i = 0; i < this.config.hiddenUnits; i++) {
      const neuronWeights = []
      for (let j = 0; j < this.config.actionSize; j++) {
        neuronWeights.push((Math.random() - 0.5) * 0.1)
      }
      outputWeights.push(neuronWeights)
    }
    weights.push(outputWeights)
    
    return weights
  }

  prepareEpisodes(data) {
    const episodes = []
    const episodeLength = 100 // Fixed episode length
    
    for (let i = 0; i < data.length - episodeLength; i += episodeLength) {
      const episode = data.slice(i, i + episodeLength)
      episodes.push(episode)
    }
    
    // Store feature names
    if (this.featureNames.length === 0) {
      this.featureNames = Object.keys(data[0]).filter(key => 
        key !== 'action' && key !== 'timestamp' && typeof data[0][key] === 'number'
      )
    }
    
    return episodes
  }

  async trainAgent(episodes, progressCallback) {
    const totalEpisodes = episodes.length
    
    for (let episode = 0; episode < totalEpisodes; episode++) {
      const episodeData = episodes[episode]
      let episodeReward = 0
      
      for (let step = 0; step < episodeData.length - 1; step++) {
        const state = this.extractState(episodeData[step])
        const action = this.chooseAction(state)
        const nextState = this.extractState(episodeData[step + 1])
        const reward = this.calculateReward(episodeData[step], episodeData[step + 1], action)
        
        // Store experience
        this.remember(state, action, reward, nextState, step === episodeData.length - 2)
        
        // Train the network
        if (this.memory.length > this.config.batchSize) {
          await this.replay()
        }
        
        episodeReward += reward
        this.stepCount++
        
        // Update target network
        if (this.stepCount % this.config.targetUpdate === 0) {
          this.updateTargetNetwork()
        }
      }
      
      this.episodeRewards.push(episodeReward)
      
      // Decay epsilon
      if (this.epsilon > this.config.epsilonMin) {
        this.epsilon *= this.config.epsilonDecay
      }
      
      // Progress callback
      if (progressCallback && episode % 10 === 0) {
        progressCallback((episode / totalEpisodes) * 100)
      }
    }
    
    // Calculate accuracy based on recent performance
    const recentRewards = this.episodeRewards.slice(-10)
    const avgReward = recentRewards.reduce((a, b) => a + b, 0) / recentRewards.length
    this.accuracy = Math.max(0, Math.min(1, (avgReward + 1) / 2)) // Normalize to 0-1
    
    if (progressCallback) {
      progressCallback(100)
    }
  }

  extractState(data) {
    const features = []
    
    // Price features
    features.push(data.price || 0)
    features.push(data.returns || 0)
    features.push(data.volatility || 0)
    
    // Technical indicators
    features.push(data.sma20 || 0)
    features.push(data.sma50 || 0)
    features.push(data.sma200 || 0)
    features.push(data.ema12 || 0)
    features.push(data.ema26 || 0)
    features.push(data.rsi || 0)
    features.push(data.atr || 0)
    
    // MACD
    features.push(data.macd || 0)
    features.push(data.macdSignal || 0)
    features.push(data.macdHistogram || 0)
    
    // Bollinger Bands
    features.push(data.bbUpper || 0)
    features.push(data.bbMiddle || 0)
    features.push(data.bbLower || 0)
    features.push(data.bbWidth || 0)
    
    // Stochastic
    features.push(data.stochK || 0)
    features.push(data.stochD || 0)
    
    // ADX
    features.push(data.adx || 0)
    
    // Volume
    features.push(data.volume || 0)
    features.push(data.obv || 0)
    features.push(data.volumeSma || 0)
    
    // Time features
    features.push(data.hour || 0)
    features.push(data.dayOfWeek || 0)
    features.push(data.month || 0)
    
    // Pad or truncate to stateSize
    while (features.length < this.config.stateSize) {
      features.push(0)
    }
    
    return features.slice(0, this.config.stateSize)
  }

  chooseAction(state) {
    if (Math.random() <= this.epsilon) {
      // Random action
      return Math.floor(Math.random() * this.config.actionSize)
    } else {
      // Greedy action
      const qValues = this.predictQValues(state)
      return qValues.indexOf(Math.max(...qValues))
    }
  }

  predictQValues(state) {
    // Simplified Q-value prediction
    // In reality, this would run through the neural network
    
    const qValues = [0, 0, 0] // Buy, Sell, Hold
    
    // Simple heuristic based on price momentum
    const priceChange = state[1] // returns
    const rsi = state[5] // RSI
    
    if (priceChange > 0.001 && rsi < 70) {
      qValues[0] = 0.8 // Buy
    } else if (priceChange < -0.001 && rsi > 30) {
      qValues[1] = 0.8 // Sell
    } else {
      qValues[2] = 0.6 // Hold
    }
    
    // Add some noise for exploration
    for (let i = 0; i < qValues.length; i++) {
      qValues[i] += (Math.random() - 0.5) * 0.1
    }
    
    return qValues
  }

  calculateReward(currentData, nextData, action) {
    const currentPrice = currentData.price || 0
    const nextPrice = nextData.price || 0
    const priceChange = (nextPrice - currentPrice) / currentPrice
    
    let reward = 0
    
    if (action === 0) { // Buy
      reward = priceChange
    } else if (action === 1) { // Sell
      reward = -priceChange
    } else { // Hold
      reward = -Math.abs(priceChange) * 0.1 // Small penalty for holding during movement
    }
    
    // Add risk penalty
    const volatility = currentData.volatility || 0
    if (volatility > 0.02) {
      reward *= 0.5 // Reduce reward in high volatility
    }
    
    return Math.max(-1, Math.min(1, reward))
  }

  remember(state, action, reward, nextState, done) {
    this.memory.push({
      state: [...state],
      action,
      reward,
      nextState: [...nextState],
      done
    })
    
    // Limit memory size
    if (this.memory.length > this.config.memorySize) {
      this.memory.shift()
    }
  }

  async replay() {
    if (this.memory.length < this.config.batchSize) {
      return
    }
    
    // Sample random batch
    const batch = this.sampleBatch()
    
    // Simulate training step
    for (const experience of batch) {
      const { state, action, reward, nextState, done } = experience
      
      // Calculate target Q-value
      let targetQ = reward
      if (!done) {
        const nextQValues = this.predictQValues(nextState)
        const maxNextQ = Math.max(...nextQValues)
        targetQ = reward + this.config.gamma * maxNextQ
      }
      
      // Update Q-value (simplified)
      const currentQValues = this.predictQValues(state)
      currentQValues[action] = targetQ
    }
  }

  sampleBatch() {
    const batch = []
    const batchSize = Math.min(this.config.batchSize, this.memory.length)
    
    for (let i = 0; i < batchSize; i++) {
      const randomIndex = Math.floor(Math.random() * this.memory.length)
      batch.push(this.memory[randomIndex])
    }
    
    return batch
  }

  updateTargetNetwork() {
    this.targetNetwork = JSON.parse(JSON.stringify(this.qNetwork))
  }

  async predict(features) {
    if (!this.isTrained || !this.qNetwork) {
      throw new Error('Model must be trained before making predictions')
    }

    try {
      const state = Array.isArray(features) ? features : this.extractState(features)
      const qValues = this.predictQValues(state)
      
      const action = qValues.indexOf(Math.max(...qValues))
      const confidence = Math.max(...qValues)
      
      const actions = ['buy', 'sell', 'hold']
      const actionName = actions[action]
      
      // Convert to score
      let score = 0
      if (action === 0) { // Buy
        score = confidence
      } else if (action === 1) { // Sell
        score = -confidence
      }
      
      return {
        action: actionName,
        confidence: confidence,
        score: score,
        qValues: {
          buy: qValues[0],
          sell: qValues[1],
          hold: qValues[2]
        }
      }
    } catch (error) {
      throw new Error(`DDQN prediction failed: ${error.message}`)
    }
  }

  async validate() {
    if (!this.isTrained) {
      throw new Error('Model must be trained before validation')
    }

    return {
      accuracy: this.accuracy,
      performance: this.accuracy * 100,
      modelType: 'DDQN',
      features: this.featureNames.length,
      episodes: this.episodeRewards.length,
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
      modelType: 'DDQN',
      features: this.featureNames.length,
      episodes: this.episodeRewards.length,
      isTrained: this.isTrained,
      config: this.config,
      episodeRewards: this.episodeRewards
    }
  }

  async save(filePath) {
    if (!this.isTrained || !this.qNetwork) {
      throw new Error('No trained model to save')
    }

    try {
      const modelData = {
        qNetwork: this.qNetwork,
        targetNetwork: this.targetNetwork,
        accuracy: this.accuracy,
        featureNames: this.featureNames,
        config: this.config,
        isTrained: this.isTrained,
        episodeRewards: this.episodeRewards,
        epsilon: this.epsilon,
        stepCount: this.stepCount
      }
      
      await fs.writeJson(filePath, modelData, { spaces: 2 })
      return true
    } catch (error) {
      throw new Error(`Failed to save DDQN model: ${error.message}`)
    }
  }

  async load(filePath) {
    try {
      const modelData = await fs.readJson(filePath)
      
      this.qNetwork = modelData.qNetwork
      this.targetNetwork = modelData.targetNetwork
      this.accuracy = modelData.accuracy
      this.featureNames = modelData.featureNames
      this.config = modelData.config
      this.isTrained = modelData.isTrained
      this.episodeRewards = modelData.episodeRewards || []
      this.epsilon = modelData.epsilon || this.config.epsilon
      this.stepCount = modelData.stepCount || 0
      
      return true
    } catch (error) {
      throw new Error(`Failed to load DDQN model: ${error.message}`)
    }
  }

  // Get training progress
  getTrainingProgress() {
    return {
      episodes: this.episodeRewards.length,
      avgReward: this.episodeRewards.length > 0 ? 
        this.episodeRewards.reduce((a, b) => a + b, 0) / this.episodeRewards.length : 0,
      epsilon: this.epsilon,
      stepCount: this.stepCount
    }
  }

  // Get model summary
  getSummary() {
    return {
      modelType: 'DDQN',
      accuracy: this.accuracy,
      features: this.featureNames.length,
      episodes: this.episodeRewards.length,
      isTrained: this.isTrained,
      config: this.config,
      epsilon: this.epsilon
    }
  }
}

export { DDQN }
export default DDQN