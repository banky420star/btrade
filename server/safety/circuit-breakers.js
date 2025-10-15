import { Logger } from '../utils/logger.js'

class CircuitBreakers {
  constructor() {
    this.logger = new Logger()
    this.breakers = new Map()
    this.initializeBreakers()
  }

  initializeBreakers() {
    // Loss-based circuit breakers
    this.breakers.set('daily_loss', {
      enabled: true,
      threshold: 0.05, // 5% daily loss
      action: 'stop_trading',
      cooldown: 3600000, // 1 hour
      lastTriggered: null
    })

    this.breakers.set('consecutive_losses', {
      enabled: true,
      threshold: 5, // 5 consecutive losses
      action: 'reduce_size',
      cooldown: 1800000, // 30 minutes
      lastTriggered: null
    })

    this.breakers.set('drawdown', {
      enabled: true,
      threshold: 0.15, // 15% drawdown
      action: 'emergency_stop',
      cooldown: 7200000, // 2 hours
      lastTriggered: null
    })

    // Volatility-based circuit breakers
    this.breakers.set('high_volatility', {
      enabled: true,
      threshold: 0.3, // 30% volatility
      action: 'reduce_size',
      cooldown: 900000, // 15 minutes
      lastTriggered: null
    })

    this.breakers.set('spike_volatility', {
      enabled: true,
      threshold: 0.5, // 50% spike
      action: 'stop_trading',
      cooldown: 1800000, // 30 minutes
      lastTriggered: null
    })

    // Performance-based circuit breakers
    this.breakers.set('low_win_rate', {
      enabled: true,
      threshold: 0.3, // 30% win rate
      action: 'reduce_size',
      cooldown: 3600000, // 1 hour
      lastTriggered: null
    })

    this.breakers.set('negative_sharpe', {
      enabled: true,
      threshold: -0.5, // Negative Sharpe ratio
      action: 'stop_trading',
      cooldown: 7200000, // 2 hours
      lastTriggered: null
    })

    // Time-based circuit breakers
    this.breakers.set('overtrading', {
      enabled: true,
      threshold: 50, // 50 trades per hour
      action: 'slow_down',
      cooldown: 1800000, // 30 minutes
      lastTriggered: null
    })

    this.breakers.set('weekend_trading', {
      enabled: true,
      threshold: 0, // No weekend trading
      action: 'stop_trading',
      cooldown: 0,
      lastTriggered: null
    })

    // System-based circuit breakers
    this.breakers.set('high_cpu', {
      enabled: true,
      threshold: 80, // 80% CPU usage
      action: 'reduce_frequency',
      cooldown: 300000, // 5 minutes
      lastTriggered: null
    })

    this.breakers.set('memory_usage', {
      enabled: true,
      threshold: 0.9, // 90% memory usage
      action: 'cleanup',
      cooldown: 600000, // 10 minutes
      lastTriggered: null
    })
  }

  // Check all circuit breakers
  checkBreakers(context) {
    const triggeredBreakers = []
    
    for (const [name, breaker] of this.breakers) {
      if (!breaker.enabled) continue
      
      // Check if breaker is in cooldown
      if (breaker.lastTriggered && 
          Date.now() - breaker.lastTriggered < breaker.cooldown) {
        continue
      }
      
      const isTriggered = this.checkBreaker(name, breaker, context)
      
      if (isTriggered) {
        triggeredBreakers.push({
          name,
          breaker,
          action: breaker.action,
          timestamp: new Date().toISOString()
        })
        
        breaker.lastTriggered = Date.now()
        this.logger.risk('CIRCUIT_BREAKER_TRIGGERED', {
          breaker: name,
          action: breaker.action,
          context
        })
      }
    }
    
    return triggeredBreakers
  }

  // Check individual circuit breaker
  checkBreaker(name, breaker, context) {
    switch (name) {
      case 'daily_loss':
        return context.dailyPnL < -context.account.equity * breaker.threshold
      
      case 'consecutive_losses':
        return context.consecutiveLosses >= breaker.threshold
      
      case 'drawdown':
        return context.maxDrawdown >= breaker.threshold
      
      case 'high_volatility':
        return context.avgVolatility >= breaker.threshold
      
      case 'spike_volatility':
        return context.maxVolatility >= breaker.threshold
      
      case 'low_win_rate':
        return context.winRate <= breaker.threshold
      
      case 'negative_sharpe':
        return context.sharpeRatio <= breaker.threshold
      
      case 'overtrading':
        return context.tradesPerHour >= breaker.threshold
      
      case 'weekend_trading':
        const now = new Date()
        const day = now.getDay()
        return day === 0 || day === 6
      
      case 'high_cpu':
        return context.cpuUsage >= breaker.threshold
      
      case 'memory_usage':
        return context.memoryUsage >= breaker.threshold
      
      default:
        return false
    }
  }

  // Execute circuit breaker action
  executeAction(action, context) {
    switch (action) {
      case 'stop_trading':
        this.logger.alert('error', 'Trading stopped due to circuit breaker')
        return { stopTrading: true }
      
      case 'emergency_stop':
        this.logger.alert('error', 'Emergency stop triggered by circuit breaker')
        return { emergencyStop: true }
      
      case 'reduce_size':
        this.logger.alert('warn', 'Position size reduced due to circuit breaker')
        return { reduceSize: 0.5 } // Reduce to 50%
      
      case 'slow_down':
        this.logger.alert('warn', 'Trading frequency reduced due to circuit breaker')
        return { slowDown: 2 } // Double the interval
      
      case 'reduce_frequency':
        this.logger.alert('warn', 'System frequency reduced due to circuit breaker')
        return { reduceFrequency: 2 }
      
      case 'cleanup':
        this.logger.alert('warn', 'System cleanup triggered by circuit breaker')
        return { cleanup: true }
      
      default:
        this.logger.warn(`Unknown circuit breaker action: ${action}`)
        return {}
    }
  }

  // Reset circuit breaker
  resetBreaker(name) {
    if (this.breakers.has(name)) {
      this.breakers.get(name).lastTriggered = null
      this.logger.info(`Circuit breaker ${name} reset`)
    }
  }

  // Enable/disable circuit breaker
  setBreakerStatus(name, enabled) {
    if (this.breakers.has(name)) {
      this.breakers.get(name).enabled = enabled
      this.logger.info(`Circuit breaker ${name} ${enabled ? 'enabled' : 'disabled'}`)
    }
  }

  // Update circuit breaker threshold
  updateBreakerThreshold(name, threshold) {
    if (this.breakers.has(name)) {
      this.breakers.get(name).threshold = threshold
      this.logger.info(`Circuit breaker ${name} threshold updated to ${threshold}`)
    }
  }

  // Get circuit breaker status
  getBreakerStatus() {
    const status = {}
    for (const [name, breaker] of this.breakers) {
      status[name] = {
        enabled: breaker.enabled,
        threshold: breaker.threshold,
        action: breaker.action,
        cooldown: breaker.cooldown,
        lastTriggered: breaker.lastTriggered,
        inCooldown: breaker.lastTriggered && 
                   Date.now() - breaker.lastTriggered < breaker.cooldown
      }
    }
    return status
  }

  // Get active circuit breakers
  getActiveBreakers() {
    const active = []
    for (const [name, breaker] of this.breakers) {
      if (breaker.lastTriggered && 
          Date.now() - breaker.lastTriggered < breaker.cooldown) {
        active.push({
          name,
          action: breaker.action,
          triggeredAt: breaker.lastTriggered,
          cooldownUntil: breaker.lastTriggered + breaker.cooldown
        })
      }
    }
    return active
  }

  // Clear all circuit breakers
  clearAllBreakers() {
    for (const [name, breaker] of this.breakers) {
      breaker.lastTriggered = null
    }
    this.logger.info('All circuit breakers cleared')
  }
}

export { CircuitBreakers }
export default CircuitBreakers