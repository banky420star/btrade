import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import dotenv from 'dotenv'
import cron from 'node-cron'
import { TradingEngine } from './trading/engine.js'
import { DataManager } from './data/manager.js'
import { ModelManager } from './ml/manager.js'
import { RiskManager } from './risk/manager.js'
import { Logger } from './utils/logger.js'
import { MetricsCollector } from './monitoring/metrics.js'

dotenv.config()

const app = express()
const server = createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
})

// Initialize core components
const logger = new Logger()
const dataManager = new DataManager()
const modelManager = new ModelManager()
const riskManager = new RiskManager()
const metricsCollector = new MetricsCollector()
const tradingEngine = new TradingEngine({
  dataManager,
  modelManager,
  riskManager,
  logger,
  io
})

// Middleware
app.use(helmet())
app.use(compression())
app.use(morgan('combined'))
app.use(cors())
app.use(express.json())

// Global state
let systemState = {
  isRunning: false,
  tradingMode: 'paper',
  emergencyStop: false,
  lastUpdate: new Date().toISOString()
}

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info('Client connected:', socket.id)

  // Send initial data
  socket.emit('system_state', systemState)
  socket.emit('positions_update', tradingEngine.getPositions())
  socket.emit('orders_update', tradingEngine.getOrders())
  socket.emit('balance_update', tradingEngine.getBalance())
  socket.emit('models_update', modelManager.getModelStatus())
  socket.emit('metrics_update', metricsCollector.getMetrics())

  // Handle commands
  socket.on('execute_command', async (data) => {
    try {
      logger.info('Executing command:', data.command)
      const result = await executeCommand(data.command)
      
      socket.emit('alert', {
        id: Date.now().toString(),
        type: 'success',
        message: `Command executed: ${data.command}`,
        timestamp: new Date().toISOString(),
        read: false
      })
    } catch (error) {
      logger.error('Command execution failed:', error)
      socket.emit('alert', {
        id: Date.now().toString(),
        type: 'error',
        message: `Command failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        read: false
      })
    }
  })

  // Handle trading mode changes
  socket.on('set_trading_mode', async (data) => {
    try {
      await setTradingMode(data.mode)
      socket.emit('alert', {
        id: Date.now().toString(),
        type: 'warning',
        message: `Trading mode switched to ${data.mode}`,
        timestamp: new Date().toISOString(),
        read: false
      })
    } catch (error) {
      logger.error('Failed to change trading mode:', error)
      socket.emit('alert', {
        id: Date.now().toString(),
        type: 'error',
        message: `Failed to change trading mode: ${error.message}`,
        timestamp: new Date().toISOString(),
        read: false
      })
    }
  })

  // Handle emergency stop
  socket.on('emergency_stop', async () => {
    try {
      await emergencyStop()
      io.emit('alert', {
        id: Date.now().toString(),
        type: 'error',
        message: 'Emergency stop activated - All trading halted',
        timestamp: new Date().toISOString(),
        read: false
      })
    } catch (error) {
      logger.error('Emergency stop failed:', error)
    }
  })

  socket.on('disconnect', () => {
    logger.info('Client disconnected:', socket.id)
  })
})

// Command execution
async function executeCommand(command) {
  const cmd = command.toLowerCase().trim()
  
  if (cmd.includes('start trading')) {
    return await startTrading()
  } else if (cmd.includes('stop trading')) {
    return await stopTrading()
  } else if (cmd.includes('retrain')) {
    return await retrainModels()
  } else if (cmd.includes('backtest')) {
    return await runBacktest()
  } else if (cmd.includes('fetch data')) {
    return await fetchData()
  } else {
    throw new Error('Unknown command')
  }
}

// Trading control functions
async function startTrading() {
  if (systemState.emergencyStop) {
    throw new Error('Cannot start trading - Emergency stop is active')
  }
  
  systemState.isRunning = true
  await tradingEngine.start()
  logger.info('Trading started')
  return 'Trading started successfully'
}

async function stopTrading() {
  systemState.isRunning = false
  await tradingEngine.stop()
  logger.info('Trading stopped')
  return 'Trading stopped successfully'
}

async function setTradingMode(mode) {
  if (!['paper', 'live'].includes(mode)) {
    throw new Error('Invalid trading mode')
  }
  
  systemState.tradingMode = mode
  await tradingEngine.setMode(mode)
  logger.info(`Trading mode set to ${mode}`)
}

async function emergencyStop() {
  systemState.emergencyStop = true
  systemState.isRunning = false
  
  await tradingEngine.emergencyStop()
  logger.warn('Emergency stop activated')
}

async function retrainModels() {
  logger.info('Starting model retraining')
  await modelManager.retrainAll()
  return 'Model retraining completed'
}

async function runBacktest() {
  logger.info('Starting backtest')
  const results = await tradingEngine.backtest()
  return `Backtest completed: ${JSON.stringify(results)}`
}

async function fetchData() {
  logger.info('Fetching market data')
  await dataManager.fetchLatestData()
  return 'Data fetch completed'
}

// Scheduled tasks
cron.schedule('*/5 * * * *', async () => {
  if (systemState.isRunning) {
    await dataManager.fetchLatestData()
  }
})

cron.schedule('0 */4 * * *', async () => {
  if (systemState.isRunning) {
    await modelManager.validateModels()
  }
})

// Real-time data updates
setInterval(() => {
  if (systemState.isRunning) {
    io.emit('positions_update', tradingEngine.getPositions())
    io.emit('orders_update', tradingEngine.getOrders())
    io.emit('balance_update', tradingEngine.getBalance())
    io.emit('metrics_update', metricsCollector.getMetrics())
  }
}, 1000)

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    system: systemState
  })
})

app.get('/api/status', (req, res) => {
  res.json({
    system: systemState.isRunning ? 'online' : 'offline',
    mode: systemState.tradingMode,
    models: modelManager.getModelStatus(),
    positions: tradingEngine.getPositions().length,
    orders: tradingEngine.getOrders().length,
    emergencyStop: systemState.emergencyStop
  })
})

app.get('/api/metrics', (req, res) => {
  res.json(metricsCollector.getMetrics())
})

app.post('/api/command', async (req, res) => {
  try {
    const result = await executeCommand(req.body.command)
    res.json({ success: true, result })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

const PORT = process.env.PORT || 8000

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
  
  // Initialize system
  Promise.all([
    dataManager.initialize(),
    modelManager.initialize(),
    tradingEngine.initialize()
  ]).then(() => {
    logger.info('System initialized successfully')
  }).catch(error => {
    logger.error('System initialization failed:', error)
  })
})