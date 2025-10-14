import { Logger } from '../utils/logger.js'
import { createClient } from 'redis'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class MetricsCollector {
  constructor() {
    this.logger = new Logger()
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    })
    
    // Metrics storage
    this.metrics = {
      trading: {
        total_trades: 0,
        winning_trades: 0,
        losing_trades: 0,
        win_rate: 0,
        avg_win: 0,
        avg_loss: 0,
        profit_factor: 0,
        sharpe_ratio: 0,
        sortino_ratio: 0,
        calmar_ratio: 0,
        max_drawdown: 0,
        current_drawdown: 0,
        total_return: 0,
        annualized_return: 0,
        volatility: 0,
        var_95: 0,
        var_99: 0,
        expected_shortfall: 0,
        best_trade: 0,
        worst_trade: 0,
        consecutive_wins: 0,
        consecutive_losses: 0,
        max_consecutive_wins: 0,
        max_consecutive_losses: 0,
        avg_trade_duration: 0,
        avg_daily_trades: 0,
        avg_weekly_trades: 0,
        avg_monthly_trades: 0
      },
      models: {
        ddqn: {
          accuracy: 0,
          precision: 0,
          recall: 0,
          f1_score: 0,
          mse: 0,
          mae: 0,
          r2_score: 0,
          sharpe_ratio: 0,
          max_drawdown: 0,
          profit_factor: 0,
          win_rate: 0,
          training_step: 0,
          epsilon: 0,
          memory_size: 0
        },
        lstm: {
          mse: 0,
          mae: 0,
          mape: 0,
          r2_score: 0,
          sharpe_ratio: 0,
          max_drawdown: 0,
          training_step: 0,
          epoch: 0,
          best_loss: 0,
          training_buffer_size: 0
        },
        random_forest: {
          accuracy: 0,
          precision: 0,
          recall: 0,
          f1_score: 0,
          r2_score: 0,
          mse: 0,
          mae: 0,
          training_step: 0,
          feature_importance: [],
          training_buffer_size: 0,
          tree_count: 0
        },
        ensemble: {
          accuracy: 0,
          sharpe_ratio: 0,
          max_drawdown: 0,
          weights: {
            ddqn: 0.4,
            lstm: 0.35,
            random_forest: 0.25
          }
        }
      },
      system: {
        uptime: 0,
        memory_usage: 0,
        cpu_usage: 0,
        disk_usage: 0,
        network_latency: 0,
        api_response_time: 0,
        data_quality: 0,
        model_performance: 0,
        risk_score: 0,
        alert_count: 0,
        error_count: 0,
        warning_count: 0
      },
      portfolio: {
        total_balance: 0,
        available_balance: 0,
        invested_balance: 0,
        profit: 0,
        profit_pct: 0,
        daily_pnl: 0,
        weekly_pnl: 0,
        monthly_pnl: 0,
        yearly_pnl: 0,
        position_count: 0,
        max_position_size: 0,
        avg_position_size: 0,
        exposure: 0,
        leverage: 0,
        margin_used: 0,
        free_margin: 0
      },
      risk: {
        var_95: 0,
        var_99: 0,
        expected_shortfall: 0,
        max_drawdown: 0,
        current_drawdown: 0,
        sharpe_ratio: 0,
        sortino_ratio: 0,
        calmar_ratio: 0,
        max_consecutive_losses: 0,
        current_consecutive_losses: 0,
        stress_test_score: 0,
        correlation_risk: 0,
        concentration_risk: 0,
        liquidity_risk: 0,
        volatility_risk: 0
      }
    }
    
    // Historical data
    this.history = {
      trading: [],
      models: [],
      system: [],
      portfolio: [],
      risk: []
    }
    
    // Configuration
    this.config = {
      update_interval: 1000, // 1 second
      history_retention: 10000, // Keep last 10k records
      alert_thresholds: {
        drawdown: 0.15,
        var: 0.03,
        consecutive_losses: 5,
        error_rate: 0.05,
        memory_usage: 0.9,
        cpu_usage: 0.9
      },
      performance_targets: {
        min_sharpe_ratio: 1.0,
        max_drawdown: 0.1,
        min_win_rate: 0.6,
        min_profit_factor: 1.5
      }
    }
    
    // Alerts
    this.alerts = []
    this.maxAlerts = 1000
    
    this.isInitialized = false
  }

  async initialize() {
    try {
      await this.redis.connect()
      await this.loadMetrics()
      this.startMetricsCollection()
      this.isInitialized = true
      this.logger.info('MetricsCollector: Initialized successfully')
    } catch (error) {
      this.logger.error('MetricsCollector: Initialization failed', error)
      throw error
    }
  }

  startMetricsCollection() {
    setInterval(() => {
      this.collectMetrics()
    }, this.config.update_interval)
  }

  async collectMetrics() {
    try {
      // Collect system metrics
      await this.collectSystemMetrics()
      
      // Collect trading metrics
      await this.collectTradingMetrics()
      
      // Collect model metrics
      await this.collectModelMetrics()
      
      // Collect portfolio metrics
      await this.collectPortfolioMetrics()
      
      // Collect risk metrics
      await this.collectRiskMetrics()
      
      // Check for alerts
      this.checkAlerts()
      
      // Save metrics
      await this.saveMetrics()
      
    } catch (error) {
      this.logger.error('Error collecting metrics:', error)
    }
  }

  async collectSystemMetrics() {
    try {
      const systemMetrics = {
        uptime: process.uptime(),
        memory_usage: process.memoryUsage().heapUsed / process.memoryUsage().heapTotal,
        cpu_usage: await this.getCpuUsage(),
        disk_usage: await this.getDiskUsage(),
        network_latency: await this.getNetworkLatency(),
        api_response_time: await this.getApiResponseTime(),
        data_quality: await this.getDataQuality(),
        model_performance: await this.getModelPerformance(),
        risk_score: await this.getRiskScore(),
        alert_count: this.alerts.length,
        error_count: await this.getErrorCount(),
        warning_count: await this.getWarningCount()
      }
      
      this.metrics.system = systemMetrics
      this.addToHistory('system', systemMetrics)
      
    } catch (error) {
      this.logger.error('Error collecting system metrics:', error)
    }
  }

  async collectTradingMetrics() {
    try {
      // This would be called from the trading engine
      // For now, we'll use placeholder data
      const tradingMetrics = {
        total_trades: this.metrics.trading.total_trades,
        winning_trades: this.metrics.trading.winning_trades,
        losing_trades: this.metrics.trading.losing_trades,
        win_rate: this.metrics.trading.win_rate,
        avg_win: this.metrics.trading.avg_win,
        avg_loss: this.metrics.trading.avg_loss,
        profit_factor: this.metrics.trading.profit_factor,
        sharpe_ratio: this.metrics.trading.sharpe_ratio,
        sortino_ratio: this.metrics.trading.sortino_ratio,
        calmar_ratio: this.metrics.trading.calmar_ratio,
        max_drawdown: this.metrics.trading.max_drawdown,
        current_drawdown: this.metrics.trading.current_drawdown,
        total_return: this.metrics.trading.total_return,
        annualized_return: this.metrics.trading.annualized_return,
        volatility: this.metrics.trading.volatility,
        var_95: this.metrics.trading.var_95,
        var_99: this.metrics.trading.var_99,
        expected_shortfall: this.metrics.trading.expected_shortfall,
        best_trade: this.metrics.trading.best_trade,
        worst_trade: this.metrics.trading.worst_trade,
        consecutive_wins: this.metrics.trading.consecutive_wins,
        consecutive_losses: this.metrics.trading.consecutive_losses,
        max_consecutive_wins: this.metrics.trading.max_consecutive_wins,
        max_consecutive_losses: this.metrics.trading.max_consecutive_losses,
        avg_trade_duration: this.metrics.trading.avg_trade_duration,
        avg_daily_trades: this.metrics.trading.avg_daily_trades,
        avg_weekly_trades: this.metrics.trading.avg_weekly_trades,
        avg_monthly_trades: this.metrics.trading.avg_monthly_trades
      }
      
      this.metrics.trading = tradingMetrics
      this.addToHistory('trading', tradingMetrics)
      
    } catch (error) {
      this.logger.error('Error collecting trading metrics:', error)
    }
  }

  async collectModelMetrics() {
    try {
      // This would be called from the model manager
      // For now, we'll use placeholder data
      const modelMetrics = {
        ddqn: this.metrics.models.ddqn,
        lstm: this.metrics.models.lstm,
        random_forest: this.metrics.models.random_forest,
        ensemble: this.metrics.models.ensemble
      }
      
      this.metrics.models = modelMetrics
      this.addToHistory('models', modelMetrics)
      
    } catch (error) {
      this.logger.error('Error collecting model metrics:', error)
    }
  }

  async collectPortfolioMetrics() {
    try {
      // This would be called from the trading engine
      // For now, we'll use placeholder data
      const portfolioMetrics = {
        total_balance: this.metrics.portfolio.total_balance,
        available_balance: this.metrics.portfolio.available_balance,
        invested_balance: this.metrics.portfolio.invested_balance,
        profit: this.metrics.portfolio.profit,
        profit_pct: this.metrics.portfolio.profit_pct,
        daily_pnl: this.metrics.portfolio.daily_pnl,
        weekly_pnl: this.metrics.portfolio.weekly_pnl,
        monthly_pnl: this.metrics.portfolio.monthly_pnl,
        yearly_pnl: this.metrics.portfolio.yearly_pnl,
        position_count: this.metrics.portfolio.position_count,
        max_position_size: this.metrics.portfolio.max_position_size,
        avg_position_size: this.metrics.portfolio.avg_position_size,
        exposure: this.metrics.portfolio.exposure,
        leverage: this.metrics.portfolio.leverage,
        margin_used: this.metrics.portfolio.margin_used,
        free_margin: this.metrics.portfolio.free_margin
      }
      
      this.metrics.portfolio = portfolioMetrics
      this.addToHistory('portfolio', portfolioMetrics)
      
    } catch (error) {
      this.logger.error('Error collecting portfolio metrics:', error)
    }
  }

  async collectRiskMetrics() {
    try {
      // This would be called from the risk manager
      // For now, we'll use placeholder data
      const riskMetrics = {
        var_95: this.metrics.risk.var_95,
        var_99: this.metrics.risk.var_99,
        expected_shortfall: this.metrics.risk.expected_shortfall,
        max_drawdown: this.metrics.risk.max_drawdown,
        current_drawdown: this.metrics.risk.current_drawdown,
        sharpe_ratio: this.metrics.risk.sharpe_ratio,
        sortino_ratio: this.metrics.risk.sortino_ratio,
        calmar_ratio: this.metrics.risk.calmar_ratio,
        max_consecutive_losses: this.metrics.risk.max_consecutive_losses,
        current_consecutive_losses: this.metrics.risk.current_consecutive_losses,
        stress_test_score: this.metrics.risk.stress_test_score,
        correlation_risk: this.metrics.risk.correlation_risk,
        concentration_risk: this.metrics.risk.concentration_risk,
        liquidity_risk: this.metrics.risk.liquidity_risk,
        volatility_risk: this.metrics.risk.volatility_risk
      }
      
      this.metrics.risk = riskMetrics
      this.addToHistory('risk', riskMetrics)
      
    } catch (error) {
      this.logger.error('Error collecting risk metrics:', error)
    }
  }

  addToHistory(category, data) {
    const record = {
      timestamp: Date.now(),
      data: data
    }
    
    this.history[category].push(record)
    
    // Keep only recent history
    if (this.history[category].length > this.config.history_retention) {
      this.history[category] = this.history[category].slice(-this.config.history_retention)
    }
  }

  checkAlerts() {
    const alerts = []
    
    // Check drawdown alert
    if (this.metrics.trading.current_drawdown > this.config.alert_thresholds.drawdown) {
      alerts.push({
        type: 'drawdown',
        severity: 'error',
        message: `High drawdown: ${(this.metrics.trading.current_drawdown * 100).toFixed(1)}%`,
        timestamp: Date.now(),
        value: this.metrics.trading.current_drawdown,
        threshold: this.config.alert_thresholds.drawdown
      })
    }
    
    // Check VaR alert
    if (this.metrics.trading.var_95 > this.config.alert_thresholds.var) {
      alerts.push({
        type: 'var',
        severity: 'warning',
        message: `High VaR: ${(this.metrics.trading.var_95 * 100).toFixed(1)}%`,
        timestamp: Date.now(),
        value: this.metrics.trading.var_95,
        threshold: this.config.alert_thresholds.var
      })
    }
    
    // Check consecutive losses alert
    if (this.metrics.trading.consecutive_losses > this.config.alert_thresholds.consecutive_losses) {
      alerts.push({
        type: 'consecutive_losses',
        severity: 'warning',
        message: `Consecutive losses: ${this.metrics.trading.consecutive_losses}`,
        timestamp: Date.now(),
        value: this.metrics.trading.consecutive_losses,
        threshold: this.config.alert_thresholds.consecutive_losses
      })
    }
    
    // Check error rate alert
    if (this.metrics.system.error_count > this.config.alert_thresholds.error_rate * 1000) {
      alerts.push({
        type: 'error_rate',
        severity: 'error',
        message: `High error rate: ${this.metrics.system.error_count}`,
        timestamp: Date.now(),
        value: this.metrics.system.error_count,
        threshold: this.config.alert_thresholds.error_rate * 1000
      })
    }
    
    // Check memory usage alert
    if (this.metrics.system.memory_usage > this.config.alert_thresholds.memory_usage) {
      alerts.push({
        type: 'memory_usage',
        severity: 'warning',
        message: `High memory usage: ${(this.metrics.system.memory_usage * 100).toFixed(1)}%`,
        timestamp: Date.now(),
        value: this.metrics.system.memory_usage,
        threshold: this.config.alert_thresholds.memory_usage
      })
    }
    
    // Check CPU usage alert
    if (this.metrics.system.cpu_usage > this.config.alert_thresholds.cpu_usage) {
      alerts.push({
        type: 'cpu_usage',
        severity: 'warning',
        message: `High CPU usage: ${(this.metrics.system.cpu_usage * 100).toFixed(1)}%`,
        timestamp: Date.now(),
        value: this.metrics.system.cpu_usage,
        threshold: this.config.alert_thresholds.cpu_usage
      })
    }
    
    // Add new alerts
    for (const alert of alerts) {
      this.addAlert(alert)
    }
  }

  addAlert(alert) {
    this.alerts.push(alert)
    
    // Keep only recent alerts
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(-this.maxAlerts)
    }
    
    // Log alert
    this.logger.warn(`Alert: ${alert.message}`)
  }

  // Utility functions for system metrics
  async getCpuUsage() {
    // Simplified CPU usage calculation
    // In production, use proper CPU monitoring
    return Math.random() * 0.5 // Placeholder
  }

  async getDiskUsage() {
    // Simplified disk usage calculation
    // In production, use proper disk monitoring
    return Math.random() * 0.3 // Placeholder
  }

  async getNetworkLatency() {
    // Simplified network latency calculation
    // In production, use proper network monitoring
    return Math.random() * 100 // Placeholder
  }

  async getApiResponseTime() {
    // Simplified API response time calculation
    // In production, use proper API monitoring
    return Math.random() * 50 // Placeholder
  }

  async getDataQuality() {
    // Simplified data quality calculation
    // In production, use proper data quality monitoring
    return Math.random() * 0.2 + 0.8 // Placeholder
  }

  async getModelPerformance() {
    // Simplified model performance calculation
    // In production, use proper model performance monitoring
    return Math.random() * 0.2 + 0.8 // Placeholder
  }

  async getRiskScore() {
    // Simplified risk score calculation
    // In production, use proper risk scoring
    return Math.random() * 0.3 + 0.2 // Placeholder
  }

  async getErrorCount() {
    // Simplified error count calculation
    // In production, use proper error monitoring
    return Math.floor(Math.random() * 10) // Placeholder
  }

  async getWarningCount() {
    // Simplified warning count calculation
    // In production, use proper warning monitoring
    return Math.floor(Math.random() * 20) // Placeholder
  }

  // Public methods for updating metrics
  updateTradingMetrics(tradingData) {
    this.metrics.trading = { ...this.metrics.trading, ...tradingData }
  }

  updateModelMetrics(modelData) {
    this.metrics.models = { ...this.metrics.models, ...modelData }
  }

  updatePortfolioMetrics(portfolioData) {
    this.metrics.portfolio = { ...this.metrics.portfolio, ...portfolioData }
  }

  updateRiskMetrics(riskData) {
    this.metrics.risk = { ...this.metrics.risk, ...riskData }
  }

  // Public methods for getting metrics
  getMetrics() {
    return {
      current: this.metrics,
      history: this.history,
      alerts: this.alerts.slice(-100), // Last 100 alerts
      performance: this.calculatePerformanceScore()
    }
  }

  getTradingMetrics() {
    return this.metrics.trading
  }

  getModelMetrics() {
    return this.metrics.models
  }

  getPortfolioMetrics() {
    return this.metrics.portfolio
  }

  getRiskMetrics() {
    return this.metrics.risk
  }

  getSystemMetrics() {
    return this.metrics.system
  }

  getAlerts() {
    return this.alerts.slice(-100) // Last 100 alerts
  }

  calculatePerformanceScore() {
    let score = 0
    let maxScore = 0
    
    // Trading performance (40% weight)
    const tradingScore = this.calculateTradingScore()
    score += tradingScore * 0.4
    maxScore += 100 * 0.4
    
    // Model performance (30% weight)
    const modelScore = this.calculateModelScore()
    score += modelScore * 0.3
    maxScore += 100 * 0.3
    
    // Risk management (20% weight)
    const riskScore = this.calculateRiskScore()
    score += riskScore * 0.2
    maxScore += 100 * 0.2
    
    // System health (10% weight)
    const systemScore = this.calculateSystemScore()
    score += systemScore * 0.1
    maxScore += 100 * 0.1
    
    return {
      overall: maxScore > 0 ? (score / maxScore) * 100 : 0,
      trading: tradingScore,
      models: modelScore,
      risk: riskScore,
      system: systemScore
    }
  }

  calculateTradingScore() {
    let score = 0
    
    // Sharpe ratio (30% weight)
    if (this.metrics.trading.sharpe_ratio > 0) {
      score += Math.min(this.metrics.trading.sharpe_ratio * 20, 30)
    }
    
    // Win rate (25% weight)
    score += this.metrics.trading.win_rate * 25
    
    // Profit factor (25% weight)
    if (this.metrics.trading.profit_factor > 0) {
      score += Math.min(this.metrics.trading.profit_factor * 10, 25)
    }
    
    // Drawdown (20% weight)
    const drawdownPenalty = this.metrics.trading.current_drawdown * 100
    score += Math.max(0, 20 - drawdownPenalty)
    
    return Math.min(score, 100)
  }

  calculateModelScore() {
    let score = 0
    
    // DDQN performance (33% weight)
    const ddqnScore = this.metrics.models.ddqn.accuracy * 100
    score += ddqnScore * 0.33
    
    // LSTM performance (33% weight)
    const lstmScore = (1 - this.metrics.models.lstm.mse) * 100
    score += lstmScore * 0.33
    
    // Random Forest performance (34% weight)
    const rfScore = this.metrics.models.random_forest.accuracy * 100
    score += rfScore * 0.34
    
    return Math.min(score, 100)
  }

  calculateRiskScore() {
    let score = 100
    
    // Drawdown penalty
    score -= this.metrics.risk.current_drawdown * 200
    
    // VaR penalty
    score -= this.metrics.risk.var_95 * 1000
    
    // Consecutive losses penalty
    score -= this.metrics.risk.current_consecutive_losses * 10
    
    return Math.max(score, 0)
  }

  calculateSystemScore() {
    let score = 100
    
    // Memory usage penalty
    score -= this.metrics.system.memory_usage * 50
    
    // CPU usage penalty
    score -= this.metrics.system.cpu_usage * 50
    
    // Error count penalty
    score -= this.metrics.system.error_count * 2
    
    return Math.max(score, 0)
  }

  async saveMetrics() {
    try {
      const metricsData = {
        metrics: this.metrics,
        history: this.history,
        alerts: this.alerts.slice(-1000), // Keep last 1000 alerts
        timestamp: Date.now()
      }
      
      const key = 'metrics_data'
      await this.redis.setex(key, 86400, JSON.stringify(metricsData))
      
      // Also save to file as backup
      const filePath = path.join(__dirname, '../data/metrics_data.json')
      await fs.ensureDir(path.dirname(filePath))
      await fs.writeJson(filePath, metricsData)
      
    } catch (error) {
      this.logger.error('Failed to save metrics:', error)
    }
  }

  async loadMetrics() {
    try {
      const key = 'metrics_data'
      const data = await this.redis.get(key)
      
      if (data) {
        const metricsData = JSON.parse(data)
        
        this.metrics = metricsData.metrics || this.metrics
        this.history = metricsData.history || this.history
        this.alerts = metricsData.alerts || this.alerts
        
        this.logger.info('Metrics loaded successfully')
      }
    } catch (error) {
      this.logger.error('Failed to load metrics:', error)
    }
  }

  async cleanup() {
    try {
      await this.saveMetrics()
      await this.redis.quit()
      this.logger.info('MetricsCollector: Cleaned up successfully')
    } catch (error) {
      this.logger.error('MetricsCollector: Cleanup failed', error)
    }
  }
}