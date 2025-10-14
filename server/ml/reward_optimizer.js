import { Logger } from '../utils/logger.js'
import { createClient } from 'redis'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class RewardOptimizer {
  constructor() {
    this.logger = new Logger()
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    })
    
    // Reward optimization configuration
    this.config = {
      // Exponential growth parameters
      exponential_growth: {
        enabled: true,
        target_annual_return: 0.5, // 50% annual return target
        compound_frequency: 'daily', // 'hourly', 'daily', 'weekly'
        growth_rate_decay: 0.95, // Decay factor for growth rate
        momentum_factor: 0.1, // Factor for momentum-based rewards
        mean_reversion_factor: 0.05, // Factor for mean reversion rewards
        trend_following_factor: 0.15, // Factor for trend following rewards
        volatility_adjustment: true, // Adjust rewards based on volatility
        risk_adjustment: true // Adjust rewards based on risk
      },
      
      // Risk-adjusted returns
      risk_adjusted: {
        enabled: true,
        sharpe_ratio_target: 2.0, // Target Sharpe ratio
        sortino_ratio_target: 3.0, // Target Sortino ratio
        calmar_ratio_target: 1.5, // Target Calmar ratio
        max_drawdown_penalty: 0.5, // Penalty for exceeding max drawdown
        var_penalty: 0.3, // Penalty for high VaR
        correlation_penalty: 0.2, // Penalty for high correlation
        concentration_penalty: 0.1 // Penalty for concentration risk
      },
      
      // Profit growth optimization
      profit_growth: {
        enabled: true,
        profit_factor_target: 2.0, // Target profit factor
        win_rate_target: 0.6, // Target win rate
        avg_win_target: 0.03, // Target average win (3%)
        avg_loss_limit: 0.015, // Limit average loss (1.5%)
        consecutive_wins_bonus: 0.1, // Bonus for consecutive wins
        consecutive_losses_penalty: 0.2, // Penalty for consecutive losses
        consistency_bonus: 0.05, // Bonus for consistent performance
        volatility_bonus: 0.02 // Bonus for low volatility
      },
      
      // Drawdown protection
      drawdown_protection: {
        enabled: true,
        max_drawdown_limit: 0.15, // 15% max drawdown
        drawdown_penalty_factor: 2.0, // Penalty factor for drawdown
        recovery_bonus: 0.1, // Bonus for recovery from drawdown
        drawdown_duration_penalty: 0.05, // Penalty for long drawdowns
        stress_test_penalty: 0.3 // Penalty for failing stress tests
      },
      
      // Advanced optimization
      advanced: {
        kelly_criterion: true, // Use Kelly Criterion for position sizing
        adaptive_learning_rate: true, // Adaptive learning rate
        momentum_decay: 0.9, // Momentum decay factor
        exploration_bonus: 0.01, // Bonus for exploration
        exploitation_bonus: 0.02, // Bonus for exploitation
        diversity_bonus: 0.03, // Bonus for portfolio diversity
        efficiency_bonus: 0.02 // Bonus for trading efficiency
      }
    }
    
    // Performance tracking
    this.performance = {
      total_reward: 0,
      exponential_growth_score: 0,
      risk_adjusted_score: 0,
      profit_growth_score: 0,
      drawdown_protection_score: 0,
      overall_score: 0,
      historical_performance: [],
      reward_history: [],
      optimization_history: []
    }
    
    // Optimization state
    this.optimizationState = {
      current_parameters: {},
      best_parameters: {},
      optimization_iteration: 0,
      convergence_threshold: 0.001,
      max_iterations: 1000,
      learning_rate: 0.01,
      momentum: 0.9,
      velocity: {}
    }
    
    this.isInitialized = false
  }

  async initialize() {
    try {
      await this.redis.connect()
      await this.loadOptimizationState()
      this.isInitialized = true
      this.logger.info('RewardOptimizer: Initialized successfully')
    } catch (error) {
      this.logger.error('RewardOptimizer: Initialization failed', error)
      throw error
    }
  }

  async calculateReward(trade, marketData, portfolioState, riskMetrics) {
    if (!this.isInitialized) {
      throw new Error('RewardOptimizer not initialized')
    }
    
    try {
      let totalReward = 0
      const rewardComponents = {}
      
      // 1. Exponential Growth Reward
      if (this.config.exponential_growth.enabled) {
        const exponentialReward = this.calculateExponentialGrowthReward(trade, marketData, portfolioState)
        totalReward += exponentialReward
        rewardComponents.exponential_growth = exponentialReward
      }
      
      // 2. Risk-Adjusted Return Reward
      if (this.config.risk_adjusted.enabled) {
        const riskAdjustedReward = this.calculateRiskAdjustedReward(trade, riskMetrics)
        totalReward += riskAdjustedReward
        rewardComponents.risk_adjusted = riskAdjustedReward
      }
      
      // 3. Profit Growth Reward
      if (this.config.profit_growth.enabled) {
        const profitGrowthReward = this.calculateProfitGrowthReward(trade, portfolioState)
        totalReward += profitGrowthReward
        rewardComponents.profit_growth = profitGrowthReward
      }
      
      // 4. Drawdown Protection Reward
      if (this.config.drawdown_protection.enabled) {
        const drawdownReward = this.calculateDrawdownProtectionReward(trade, riskMetrics)
        totalReward += drawdownReward
        rewardComponents.drawdown_protection = drawdownReward
      }
      
      // 5. Advanced Optimization Rewards
      if (this.config.advanced.enabled) {
        const advancedReward = this.calculateAdvancedReward(trade, marketData, portfolioState)
        totalReward += advancedReward
        rewardComponents.advanced = advancedReward
      }
      
      // Normalize reward
      const normalizedReward = this.normalizeReward(totalReward)
      
      // Update performance tracking
      await this.updatePerformanceTracking(normalizedReward, rewardComponents)
      
      return {
        total_reward: normalizedReward,
        components: rewardComponents,
        normalized: true
      }
      
    } catch (error) {
      this.logger.error('Error calculating reward:', error)
      return { total_reward: 0, components: {}, normalized: false }
    }
  }

  calculateExponentialGrowthReward(trade, marketData, portfolioState) {
    const config = this.config.exponential_growth
    
    // Base reward from trade P&L
    let reward = trade.pnl || 0
    
    // Apply exponential growth factor
    const growthFactor = this.calculateGrowthFactor(portfolioState)
    reward *= growthFactor
    
    // Apply momentum factor
    if (config.momentum_factor > 0) {
      const momentumReward = this.calculateMomentumReward(trade, marketData)
      reward += momentumReward * config.momentum_factor
    }
    
    // Apply mean reversion factor
    if (config.mean_reversion_factor > 0) {
      const meanReversionReward = this.calculateMeanReversionReward(trade, marketData)
      reward += meanReversionReward * config.mean_reversion_factor
    }
    
    // Apply trend following factor
    if (config.trend_following_factor > 0) {
      const trendFollowingReward = this.calculateTrendFollowingReward(trade, marketData)
      reward += trendFollowingReward * config.trend_following_factor
    }
    
    // Apply volatility adjustment
    if (config.volatility_adjustment) {
      const volatilityAdjustment = this.calculateVolatilityAdjustment(trade, marketData)
      reward *= volatilityAdjustment
    }
    
    // Apply risk adjustment
    if (config.risk_adjustment) {
      const riskAdjustment = this.calculateRiskAdjustment(trade, portfolioState)
      reward *= riskAdjustment
    }
    
    return reward
  }

  calculateGrowthFactor(portfolioState) {
    const config = this.config.exponential_growth
    
    // Calculate current growth rate
    const currentReturn = portfolioState.total_return || 0
    const targetReturn = config.target_annual_return
    
    // Apply growth rate decay
    const growthRate = Math.pow(config.growth_rate_decay, this.optimizationState.optimization_iteration)
    
    // Calculate growth factor
    const growthFactor = 1 + (currentReturn / targetReturn) * growthRate
    
    return Math.max(0.1, Math.min(10, growthFactor)) // Clamp between 0.1 and 10
  }

  calculateMomentumReward(trade, marketData) {
    // Calculate momentum-based reward
    if (marketData.length < 2) return 0
    
    const currentPrice = marketData[marketData.length - 1].close
    const previousPrice = marketData[marketData.length - 2].close
    const priceChange = (currentPrice - previousPrice) / previousPrice
    
    // Reward for following momentum
    const tradeDirection = trade.side === 'long' ? 1 : -1
    const momentumAlignment = priceChange * tradeDirection
    
    return momentumAlignment * Math.abs(trade.pnl || 0)
  }

  calculateMeanReversionReward(trade, marketData) {
    // Calculate mean reversion reward
    if (marketData.length < 20) return 0
    
    const prices = marketData.slice(-20).map(d => d.close)
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length
    const currentPrice = prices[prices.length - 1]
    const deviation = (currentPrice - mean) / mean
    
    // Reward for mean reversion trades
    const tradeDirection = trade.side === 'long' ? 1 : -1
    const meanReversionAlignment = -deviation * tradeDirection
    
    return meanReversionAlignment * Math.abs(trade.pnl || 0) * 0.5
  }

  calculateTrendFollowingReward(trade, marketData) {
    // Calculate trend following reward
    if (marketData.length < 10) return 0
    
    const prices = marketData.slice(-10).map(d => d.close)
    const trend = this.calculateTrend(prices)
    
    // Reward for following trend
    const tradeDirection = trade.side === 'long' ? 1 : -1
    const trendAlignment = trend * tradeDirection
    
    return trendAlignment * Math.abs(trade.pnl || 0)
  }

  calculateTrend(prices) {
    // Simple linear regression to calculate trend
    const n = prices.length
    const x = Array.from({ length: n }, (_, i) => i)
    const y = prices
    
    const sumX = x.reduce((sum, val) => sum + val, 0)
    const sumY = y.reduce((sum, val) => sum + val, 0)
    const sumXY = x.reduce((sum, val, i) => sum + val * y[i], 0)
    const sumXX = x.reduce((sum, val) => sum + val * val, 0)
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX)
    
    return slope
  }

  calculateVolatilityAdjustment(trade, marketData) {
    // Calculate volatility adjustment factor
    if (marketData.length < 10) return 1
    
    const returns = []
    for (let i = 1; i < marketData.length; i++) {
      const ret = (marketData[i].close - marketData[i - 1].close) / marketData[i - 1].close
      returns.push(ret)
    }
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length
    const volatility = Math.sqrt(variance)
    
    // Lower volatility = higher adjustment factor
    const adjustment = 1 / (1 + volatility * 10)
    
    return Math.max(0.1, Math.min(2, adjustment))
  }

  calculateRiskAdjustment(trade, portfolioState) {
    // Calculate risk adjustment factor
    const riskScore = portfolioState.risk_score || 0.5
    const exposure = portfolioState.exposure || 0
    
    // Lower risk and exposure = higher adjustment factor
    const riskAdjustment = (1 - riskScore) * (1 - exposure)
    
    return Math.max(0.1, Math.min(2, riskAdjustment))
  }

  calculateRiskAdjustedReward(trade, riskMetrics) {
    const config = this.config.risk_adjusted
    
    let reward = trade.pnl || 0
    
    // Apply Sharpe ratio adjustment
    const sharpeRatio = riskMetrics.sharpe_ratio || 0
    const sharpeAdjustment = Math.min(sharpeRatio / config.sharpe_ratio_target, 2)
    reward *= sharpeAdjustment
    
    // Apply Sortino ratio adjustment
    const sortinoRatio = riskMetrics.sortino_ratio || 0
    const sortinoAdjustment = Math.min(sortinoRatio / config.sortino_ratio_target, 2)
    reward *= sortinoAdjustment
    
    // Apply Calmar ratio adjustment
    const calmarRatio = riskMetrics.calmar_ratio || 0
    const calmarAdjustment = Math.min(calmarRatio / config.calmar_ratio_target, 2)
    reward *= calmarAdjustment
    
    // Apply drawdown penalty
    const drawdown = riskMetrics.current_drawdown || 0
    if (drawdown > config.max_drawdown_penalty) {
      reward *= (1 - config.max_drawdown_penalty)
    }
    
    // Apply VaR penalty
    const var95 = riskMetrics.var_95 || 0
    if (var95 > config.var_penalty) {
      reward *= (1 - config.var_penalty)
    }
    
    // Apply correlation penalty
    const correlation = riskMetrics.correlation_risk || 0
    if (correlation > 0.5) {
      reward *= (1 - config.correlation_penalty)
    }
    
    // Apply concentration penalty
    const concentration = riskMetrics.concentration_risk || 0
    if (concentration > 0.3) {
      reward *= (1 - config.concentration_penalty)
    }
    
    return reward
  }

  calculateProfitGrowthReward(trade, portfolioState) {
    const config = this.config.profit_growth
    
    let reward = trade.pnl || 0
    
    // Apply profit factor adjustment
    const profitFactor = portfolioState.profit_factor || 1
    const profitFactorAdjustment = Math.min(profitFactor / config.profit_factor_target, 2)
    reward *= profitFactorAdjustment
    
    // Apply win rate adjustment
    const winRate = portfolioState.win_rate || 0.5
    const winRateAdjustment = Math.min(winRate / config.win_rate_target, 2)
    reward *= winRateAdjustment
    
    // Apply average win adjustment
    const avgWin = portfolioState.avg_win || 0
    if (avgWin > 0) {
      const avgWinAdjustment = Math.min(avgWin / config.avg_win_target, 2)
      reward *= avgWinAdjustment
    }
    
    // Apply average loss limit
    const avgLoss = Math.abs(portfolioState.avg_loss || 0)
    if (avgLoss > config.avg_loss_limit) {
      reward *= (1 - config.avg_loss_limit)
    }
    
    // Apply consecutive wins bonus
    const consecutiveWins = portfolioState.consecutive_wins || 0
    if (consecutiveWins > 0) {
      reward *= (1 + consecutiveWins * config.consecutive_wins_bonus)
    }
    
    // Apply consecutive losses penalty
    const consecutiveLosses = portfolioState.consecutive_losses || 0
    if (consecutiveLosses > 0) {
      reward *= (1 - consecutiveLosses * config.consecutive_losses_penalty)
    }
    
    // Apply consistency bonus
    const consistency = this.calculateConsistency(portfolioState)
    reward *= (1 + consistency * config.consistency_bonus)
    
    // Apply volatility bonus
    const volatility = portfolioState.volatility || 0
    if (volatility < 0.02) {
      reward *= (1 + config.volatility_bonus)
    }
    
    return reward
  }

  calculateConsistency(portfolioState) {
    // Calculate consistency score based on recent performance
    const recentReturns = portfolioState.recent_returns || []
    if (recentReturns.length < 5) return 0
    
    const mean = recentReturns.reduce((sum, ret) => sum + ret, 0) / recentReturns.length
    const variance = recentReturns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / recentReturns.length
    const stdDev = Math.sqrt(variance)
    
    // Lower standard deviation = higher consistency
    return Math.max(0, 1 - stdDev * 10)
  }

  calculateDrawdownProtectionReward(trade, riskMetrics) {
    const config = this.config.drawdown_protection
    
    let reward = trade.pnl || 0
    
    // Apply drawdown penalty
    const drawdown = riskMetrics.current_drawdown || 0
    if (drawdown > config.max_drawdown_limit) {
      reward *= (1 - config.drawdown_penalty_factor * drawdown)
    }
    
    // Apply recovery bonus
    const isRecovery = this.isRecoveryTrade(trade, riskMetrics)
    if (isRecovery) {
      reward *= (1 + config.recovery_bonus)
    }
    
    // Apply drawdown duration penalty
    const drawdownDuration = riskMetrics.drawdown_duration || 0
    if (drawdownDuration > 7) { // More than 7 days
      reward *= (1 - config.drawdown_duration_penalty)
    }
    
    // Apply stress test penalty
    const stressTestScore = riskMetrics.stress_test_score || 0
    if (stressTestScore < 0.5) {
      reward *= (1 - config.stress_test_penalty)
    }
    
    return reward
  }

  isRecoveryTrade(trade, riskMetrics) {
    // Check if this trade is part of a recovery from drawdown
    const drawdown = riskMetrics.current_drawdown || 0
    const previousDrawdown = riskMetrics.previous_drawdown || 0
    
    return drawdown < previousDrawdown && trade.pnl > 0
  }

  calculateAdvancedReward(trade, marketData, portfolioState) {
    const config = this.config.advanced
    
    let reward = 0
    
    // Kelly Criterion bonus
    if (config.kelly_criterion) {
      const kellyReward = this.calculateKellyReward(trade, portfolioState)
      reward += kellyReward
    }
    
    // Adaptive learning rate bonus
    if (config.adaptive_learning_rate) {
      const learningReward = this.calculateLearningReward(trade, portfolioState)
      reward += learningReward
    }
    
    // Exploration bonus
    const explorationReward = this.calculateExplorationReward(trade, marketData)
    reward += explorationReward * config.exploration_bonus
    
    // Exploitation bonus
    const exploitationReward = this.calculateExploitationReward(trade, marketData)
    reward += exploitationReward * config.exploitation_bonus
    
    // Diversity bonus
    const diversityReward = this.calculateDiversityReward(trade, portfolioState)
    reward += diversityReward * config.diversity_bonus
    
    // Efficiency bonus
    const efficiencyReward = this.calculateEfficiencyReward(trade, portfolioState)
    reward += efficiencyReward * config.efficiency_bonus
    
    return reward
  }

  calculateKellyReward(trade, portfolioState) {
    // Kelly Criterion for optimal position sizing
    const winRate = portfolioState.win_rate || 0.5
    const avgWin = portfolioState.avg_win || 0.01
    const avgLoss = Math.abs(portfolioState.avg_loss || 0.01)
    
    if (avgLoss === 0) return 0
    
    const kellyFraction = (winRate * avgWin - (1 - winRate) * avgLoss) / avgWin
    const positionSize = trade.size || 0
    
    // Reward for using optimal position sizing
    return kellyFraction * positionSize * 0.1
  }

  calculateLearningReward(trade, portfolioState) {
    // Reward for adaptive learning
    const learningRate = this.optimizationState.learning_rate
    const performance = portfolioState.performance_score || 0.5
    
    return learningRate * performance * Math.abs(trade.pnl || 0) * 0.01
  }

  calculateExplorationReward(trade, marketData) {
    // Reward for exploring new strategies
    const volatility = this.calculateVolatility(marketData)
    const isNewStrategy = this.isNewStrategy(trade, marketData)
    
    return volatility * (isNewStrategy ? 1 : 0.5) * Math.abs(trade.pnl || 0)
  }

  calculateExploitationReward(trade, marketData) {
    // Reward for exploiting known profitable strategies
    const confidence = trade.confidence || 0.5
    const isKnownStrategy = this.isKnownStrategy(trade, marketData)
    
    return confidence * (isKnownStrategy ? 1 : 0.5) * Math.abs(trade.pnl || 0)
  }

  calculateDiversityReward(trade, portfolioState) {
    // Reward for portfolio diversity
    const positionCount = portfolioState.position_count || 0
    const maxPositions = portfolioState.max_positions || 10
    const diversity = positionCount / maxPositions
    
    return diversity * Math.abs(trade.pnl || 0) * 0.1
  }

  calculateEfficiencyReward(trade, portfolioState) {
    // Reward for trading efficiency
    const tradeDuration = trade.duration || 0
    const maxDuration = 24 * 60 * 60 * 1000 // 24 hours
    const efficiency = Math.max(0, 1 - tradeDuration / maxDuration)
    
    return efficiency * Math.abs(trade.pnl || 0) * 0.05
  }

  calculateVolatility(marketData) {
    if (marketData.length < 2) return 0
    
    const returns = []
    for (let i = 1; i < marketData.length; i++) {
      const ret = (marketData[i].close - marketData[i - 1].close) / marketData[i - 1].close
      returns.push(ret)
    }
    
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length
    
    return Math.sqrt(variance)
  }

  isNewStrategy(trade, marketData) {
    // Simplified check for new strategy
    // In production, implement proper strategy detection
    return Math.random() < 0.1 // 10% chance of new strategy
  }

  isKnownStrategy(trade, marketData) {
    // Simplified check for known strategy
    // In production, implement proper strategy recognition
    return Math.random() < 0.8 // 80% chance of known strategy
  }

  normalizeReward(reward) {
    // Normalize reward to prevent extreme values
    const maxReward = 1000
    const minReward = -1000
    
    return Math.max(minReward, Math.min(maxReward, reward))
  }

  async updatePerformanceTracking(reward, components) {
    this.performance.total_reward += reward
    this.performance.reward_history.push({
      timestamp: Date.now(),
      reward,
      components
    })
    
    // Keep only recent history
    if (this.performance.reward_history.length > 10000) {
      this.performance.reward_history = this.performance.reward_history.slice(-10000)
    }
    
    // Update component scores
    this.performance.exponential_growth_score = this.calculateComponentScore('exponential_growth')
    this.performance.risk_adjusted_score = this.calculateComponentScore('risk_adjusted')
    this.performance.profit_growth_score = this.calculateComponentScore('profit_growth')
    this.performance.drawdown_protection_score = this.calculateComponentScore('drawdown_protection')
    
    // Calculate overall score
    this.performance.overall_score = this.calculateOverallScore()
  }

  calculateComponentScore(component) {
    const recentRewards = this.performance.reward_history.slice(-100)
    const componentRewards = recentRewards.map(r => r.components[component] || 0)
    
    if (componentRewards.length === 0) return 0
    
    const mean = componentRewards.reduce((sum, r) => sum + r, 0) / componentRewards.length
    const variance = componentRewards.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / componentRewards.length
    const stdDev = Math.sqrt(variance)
    
    return stdDev === 0 ? mean : mean / stdDev
  }

  calculateOverallScore() {
    const scores = [
      this.performance.exponential_growth_score,
      this.performance.risk_adjusted_score,
      this.performance.profit_growth_score,
      this.performance.drawdown_protection_score
    ]
    
    const weights = [0.3, 0.3, 0.25, 0.15]
    
    let weightedSum = 0
    let totalWeight = 0
    
    for (let i = 0; i < scores.length; i++) {
      weightedSum += scores[i] * weights[i]
      totalWeight += weights[i]
    }
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0
  }

  async optimizeRewardFunction() {
    this.logger.info('Starting reward function optimization...')
    
    const maxIterations = this.optimizationState.max_iterations
    const convergenceThreshold = this.optimizationState.convergence_threshold
    
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      this.optimizationState.optimization_iteration = iteration
      
      // Calculate gradient
      const gradient = await this.calculateGradient()
      
      // Update parameters using momentum
      this.updateParameters(gradient)
      
      // Check convergence
      if (this.checkConvergence(gradient)) {
        this.logger.info(`Optimization converged after ${iteration} iterations`)
        break
      }
      
      // Log progress
      if (iteration % 100 === 0) {
        this.logger.info(`Optimization iteration ${iteration}, score: ${this.performance.overall_score.toFixed(4)}`)
      }
    }
    
    this.logger.info('Reward function optimization completed')
  }

  async calculateGradient() {
    // Simplified gradient calculation
    // In production, implement proper gradient calculation
    const gradient = {}
    
    // Calculate gradient for each parameter
    for (const param in this.optimizationState.current_parameters) {
      gradient[param] = Math.random() * 0.01 - 0.005 // Placeholder
    }
    
    return gradient
  }

  updateParameters(gradient) {
    const learningRate = this.optimizationState.learning_rate
    const momentum = this.optimizationState.momentum
    
    for (const param in gradient) {
      // Initialize velocity if not exists
      if (!this.optimizationState.velocity[param]) {
        this.optimizationState.velocity[param] = 0
      }
      
      // Update velocity with momentum
      this.optimizationState.velocity[param] = momentum * this.optimizationState.velocity[param] + learningRate * gradient[param]
      
      // Update parameter
      this.optimizationState.current_parameters[param] += this.optimizationState.velocity[param]
    }
  }

  checkConvergence(gradient) {
    const gradientNorm = Math.sqrt(Object.values(gradient).reduce((sum, g) => sum + g * g, 0))
    return gradientNorm < this.optimizationState.convergence_threshold
  }

  async saveOptimizationState() {
    try {
      const state = {
        config: this.config,
        performance: this.performance,
        optimizationState: this.optimizationState
      }
      
      const key = 'reward_optimizer_state'
      await this.redis.setex(key, 86400, JSON.stringify(state))
      
      // Also save to file as backup
      const filePath = path.join(__dirname, '../data/reward_optimizer_state.json')
      await fs.ensureDir(path.dirname(filePath))
      await fs.writeJson(filePath, state)
      
    } catch (error) {
      this.logger.error('Failed to save optimization state:', error)
    }
  }

  async loadOptimizationState() {
    try {
      const key = 'reward_optimizer_state'
      const data = await this.redis.get(key)
      
      if (data) {
        const state = JSON.parse(data)
        
        this.config = { ...this.config, ...state.config }
        this.performance = { ...this.performance, ...state.performance }
        this.optimizationState = { ...this.optimizationState, ...state.optimizationState }
        
        this.logger.info('Optimization state loaded successfully')
      }
    } catch (error) {
      this.logger.error('Failed to load optimization state:', error)
    }
  }

  async getPerformanceReport() {
    return {
      performance: this.performance,
      config: this.config,
      optimizationState: this.optimizationState
    }
  }

  async cleanup() {
    try {
      await this.saveOptimizationState()
      await this.redis.quit()
      this.logger.info('RewardOptimizer: Cleaned up successfully')
    } catch (error) {
      this.logger.error('RewardOptimizer: Cleanup failed', error)
    }
  }
}