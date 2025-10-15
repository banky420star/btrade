import { Logger } from '../utils/logger.js'
import { v4 as uuidv4 } from 'uuid'

class ExecutionEngine {
  constructor() {
    this.logger = new Logger()
    this.executionQueue = []
    this.executionHistory = []
    this.executionStats = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      averageLatency: 0
    }
    
    this.executionRules = new Map()
    this.initializeExecutionRules()
  }

  initializeExecutionRules() {
    // Execution priority rules
    this.executionRules.set('priority', {
      emergency: 1,
      high: 2,
      medium: 3,
      low: 4
    })

    // Execution timeout rules
    this.executionRules.set('timeout', {
      emergency: 1000, // 1 second
      high: 2000,      // 2 seconds
      medium: 5000,    // 5 seconds
      low: 10000       // 10 seconds
    })

    // Execution retry rules
    this.executionRules.set('retry', {
      emergency: 3,
      high: 2,
      medium: 1,
      low: 0
    })
  }

  // Add execution to queue
  async addExecution(execution) {
    const executionId = uuidv4()
    const executionWithId = {
      id: executionId,
      ...execution,
      status: 'queued',
      createdAt: new Date().toISOString(),
      priority: execution.priority || 'medium'
    }

    this.executionQueue.push(executionWithId)
    this.logger.debug('Execution added to queue', { executionId, priority: executionWithId.priority })

    // Process queue
    await this.processQueue()

    return executionId
  }

  // Process execution queue
  async processQueue() {
    if (this.executionQueue.length === 0) return

    // Sort by priority
    this.executionQueue.sort((a, b) => {
      const priorityA = this.executionRules.get('priority')[a.priority] || 999
      const priorityB = this.executionRules.get('priority')[b.priority] || 999
      return priorityA - priorityB
    })

    // Process executions in parallel (up to 5 at a time)
    const batchSize = 5
    const batch = this.executionQueue.splice(0, batchSize)
    
    const promises = batch.map(execution => this.execute(execution))
    await Promise.allSettled(promises)
  }

  // Execute individual execution
  async execute(execution) {
    const startTime = Date.now()
    execution.status = 'executing'
    execution.startedAt = new Date().toISOString()

    try {
      this.logger.debug('Executing trade', { executionId: execution.id, type: execution.type })

      let result
      switch (execution.type) {
        case 'market_order':
          result = await this.executeMarketOrder(execution)
          break
        case 'limit_order':
          result = await this.executeLimitOrder(execution)
          break
        case 'stop_order':
          result = await this.executeStopOrder(execution)
          break
        case 'close_position':
          result = await this.executeClosePosition(execution)
          break
        case 'modify_position':
          result = await this.executeModifyPosition(execution)
          break
        default:
          throw new Error(`Unknown execution type: ${execution.type}`)
      }

      execution.status = 'completed'
      execution.result = result
      execution.completedAt = new Date().toISOString()
      execution.executionTime = Date.now() - startTime

      this.logger.info('Execution completed', {
        executionId: execution.id,
        type: execution.type,
        executionTime: execution.executionTime
      })

      // Update stats
      this.updateExecutionStats(execution, true)

    } catch (error) {
      execution.status = 'failed'
      execution.error = error.message
      execution.completedAt = new Date().toISOString()
      execution.executionTime = Date.now() - startTime

      this.logger.error('Execution failed', {
        executionId: execution.id,
        type: execution.type,
        error: error.message,
        executionTime: execution.executionTime
      })

      // Update stats
      this.updateExecutionStats(execution, false)

      // Retry if applicable
      await this.handleRetry(execution)
    }

    // Add to history
    this.executionHistory.push(execution)
    if (this.executionHistory.length > 1000) {
      this.executionHistory = this.executionHistory.slice(-1000)
    }
  }

  // Execute market order
  async executeMarketOrder(execution) {
    const { symbol, side, size, price } = execution.parameters
    
    // Simulate market order execution
    await this.simulateLatency(50, 200)
    
    const executionPrice = this.calculateExecutionPrice(price, side)
    const executionTime = new Date().toISOString()
    
    return {
      orderId: uuidv4(),
      symbol,
      side,
      size,
      price: executionPrice,
      executedAt: executionTime,
      status: 'filled'
    }
  }

  // Execute limit order
  async executeLimitOrder(execution) {
    const { symbol, side, size, limitPrice } = execution.parameters
    
    // Simulate limit order execution
    await this.simulateLatency(100, 500)
    
    const executionPrice = this.calculateExecutionPrice(limitPrice, side)
    const executionTime = new Date().toISOString()
    
    return {
      orderId: uuidv4(),
      symbol,
      side,
      size,
      price: executionPrice,
      executedAt: executionTime,
      status: 'filled'
    }
  }

  // Execute stop order
  async executeStopOrder(execution) {
    const { symbol, side, size, stopPrice } = execution.parameters
    
    // Simulate stop order execution
    await this.simulateLatency(30, 150)
    
    const executionPrice = this.calculateExecutionPrice(stopPrice, side)
    const executionTime = new Date().toISOString()
    
    return {
      orderId: uuidv4(),
      symbol,
      side,
      size,
      price: executionPrice,
      executedAt: executionTime,
      status: 'filled'
    }
  }

  // Execute close position
  async executeClosePosition(execution) {
    const { positionId, size, price } = execution.parameters
    
    // Simulate position closure
    await this.simulateLatency(40, 180)
    
    const executionPrice = this.calculateExecutionPrice(price, 'close')
    const executionTime = new Date().toISOString()
    
    return {
      positionId,
      size,
      price: executionPrice,
      closedAt: executionTime,
      status: 'closed'
    }
  }

  // Execute modify position
  async executeModifyPosition(execution) {
    const { positionId, stopLoss, takeProfit } = execution.parameters
    
    // Simulate position modification
    await this.simulateLatency(30, 120)
    
    const executionTime = new Date().toISOString()
    
    return {
      positionId,
      stopLoss,
      takeProfit,
      modifiedAt: executionTime,
      status: 'modified'
    }
  }

  // Calculate execution price
  calculateExecutionPrice(price, side) {
    // Add small slippage based on side
    const slippage = 0.0001 // 0.01% slippage
    const multiplier = side === 'buy' ? 1 + slippage : 1 - slippage
    return price * multiplier
  }

  // Simulate network latency
  async simulateLatency(minMs, maxMs) {
    const latency = Math.random() * (maxMs - minMs) + minMs
    await new Promise(resolve => setTimeout(resolve, latency))
  }

  // Handle execution retry
  async handleRetry(execution) {
    const retryCount = execution.retryCount || 0
    const maxRetries = this.executionRules.get('retry')[execution.priority] || 0
    
    if (retryCount < maxRetries) {
      execution.retryCount = retryCount + 1
      execution.status = 'queued'
      execution.retryAt = new Date().toISOString()
      
      this.executionQueue.push(execution)
      this.logger.info('Execution queued for retry', {
        executionId: execution.id,
        retryCount: execution.retryCount,
        maxRetries
      })
    } else {
      this.logger.error('Execution failed after max retries', {
        executionId: execution.id,
        retryCount,
        maxRetries
      })
    }
  }

  // Update execution statistics
  updateExecutionStats(execution, success) {
    this.executionStats.totalExecutions++
    
    if (success) {
      this.executionStats.successfulExecutions++
    } else {
      this.executionStats.failedExecutions++
    }
    
    // Update average execution time
    const totalTime = this.executionStats.averageExecutionTime * (this.executionStats.totalExecutions - 1)
    this.executionStats.averageExecutionTime = (totalTime + execution.executionTime) / this.executionStats.totalExecutions
  }

  // Get execution queue status
  getQueueStatus() {
    return {
      queueLength: this.executionQueue.length,
      queueByPriority: this.getQueueByPriority(),
      averageWaitTime: this.calculateAverageWaitTime()
    }
  }

  getQueueByPriority() {
    const queueByPriority = {}
    for (const execution of this.executionQueue) {
      if (!queueByPriority[execution.priority]) {
        queueByPriority[execution.priority] = 0
      }
      queueByPriority[execution.priority]++
    }
    return queueByPriority
  }

  calculateAverageWaitTime() {
    if (this.executionQueue.length === 0) return 0
    
    const now = Date.now()
    const totalWaitTime = this.executionQueue.reduce((sum, execution) => {
      return sum + (now - new Date(execution.createdAt).getTime())
    }, 0)
    
    return totalWaitTime / this.executionQueue.length
  }

  // Get execution statistics
  getExecutionStats() {
    return {
      ...this.executionStats,
      successRate: this.executionStats.totalExecutions > 0 
        ? this.executionStats.successfulExecutions / this.executionStats.totalExecutions 
        : 0,
      failureRate: this.executionStats.totalExecutions > 0 
        ? this.executionStats.failedExecutions / this.executionStats.totalExecutions 
        : 0
    }
  }

  // Get execution history
  getExecutionHistory(limit = 100) {
    return this.executionHistory.slice(-limit)
  }

  // Clear execution queue
  clearQueue() {
    const clearedCount = this.executionQueue.length
    this.executionQueue = []
    this.logger.info(`Cleared ${clearedCount} executions from queue`)
    return clearedCount
  }

  // Get execution by ID
  getExecution(executionId) {
    return this.executionHistory.find(execution => execution.id === executionId)
  }

  // Cancel execution
  async cancelExecution(executionId) {
    const queueIndex = this.executionQueue.findIndex(execution => execution.id === executionId)
    
    if (queueIndex !== -1) {
      const execution = this.executionQueue.splice(queueIndex, 1)[0]
      execution.status = 'cancelled'
      execution.cancelledAt = new Date().toISOString()
      
      this.executionHistory.push(execution)
      
      this.logger.info('Execution cancelled', { executionId })
      return true
    }
    
    return false
  }
}

export { ExecutionEngine }
export default ExecutionEngine