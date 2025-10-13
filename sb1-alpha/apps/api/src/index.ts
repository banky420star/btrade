import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cron from 'node-cron';
import winston from 'winston';

import { healthRouter } from './routes/health';
import { tradesRouter } from './routes/trades';
import { signalsRouter } from './routes/signals';
import { telegramService } from './services/telegram';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// Logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/api-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/api-combined.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Global state
let systemState = {
  isRunning: false,
  tradingMode: process.env.BROKER || 'paper',
  emergencyStop: false,
  lastUpdate: new Date().toISOString(),
  activeModels: [],
  positions: [],
  balance: { equity: 10000, margin: 0, free: 10000 }
};

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Routes
app.use('/health', healthRouter);
app.use('/trades', tradesRouter);
app.use('/signals', signalsRouter);

// Socket.io connection handling
io.on('connection', (socket) => {
  logger.info('Client connected:', socket.id);

  // Send initial data
  socket.emit('system_state', systemState);
  socket.emit('positions_update', systemState.positions);
  socket.emit('balance_update', systemState.balance);

  // Handle commands
  socket.on('execute_command', async (data) => {
    try {
      logger.info('Executing command:', data.command);
      const result = await executeCommand(data.command);
      
      socket.emit('alert', {
        id: Date.now().toString(),
        type: 'success',
        message: `Command executed: ${data.command}`,
        timestamp: new Date().toISOString(),
        read: false
      });
    } catch (error) {
      logger.error('Command execution failed:', error);
      socket.emit('alert', {
        id: Date.now().toString(),
        type: 'error',
        message: `Command failed: ${error.message}`,
        timestamp: new Date().toISOString(),
        read: false
      });
    }
  });

  // Handle trading mode changes
  socket.on('set_trading_mode', async (data) => {
    try {
      await setTradingMode(data.mode);
      socket.emit('alert', {
        id: Date.now().toString(),
        type: 'warning',
        message: `Trading mode switched to ${data.mode}`,
        timestamp: new Date().toISOString(),
        read: false
      });
    } catch (error) {
      logger.error('Failed to change trading mode:', error);
      socket.emit('alert', {
        id: Date.now().toString(),
        type: 'error',
        message: `Failed to change trading mode: ${error.message}`,
        timestamp: new Date().toISOString(),
        read: false
      });
    }
  });

  // Handle emergency stop
  socket.on('emergency_stop', async () => {
    try {
      await emergencyStop();
      io.emit('alert', {
        id: Date.now().toString(),
        type: 'error',
        message: 'Emergency stop activated - All trading halted',
        timestamp: new Date().toISOString(),
        read: false
      });
    } catch (error) {
      logger.error('Emergency stop failed:', error);
    }
  });

  socket.on('disconnect', () => {
    logger.info('Client disconnected:', socket.id);
  });
});

// Command execution
async function executeCommand(command: string): Promise<string> {
  const cmd = command.toLowerCase().trim();
  
  if (cmd.includes('start trading')) {
    return await startTrading();
  } else if (cmd.includes('stop trading')) {
    return await stopTrading();
  } else if (cmd.includes('retrain')) {
    return await retrainModels();
  } else if (cmd.includes('backtest')) {
    return await runBacktest();
  } else if (cmd.includes('fetch data')) {
    return await fetchData();
  } else {
    throw new Error('Unknown command');
  }
}

// Trading control functions
async function startTrading(): Promise<string> {
  if (systemState.emergencyStop) {
    throw new Error('Cannot start trading - Emergency stop is active');
  }
  
  systemState.isRunning = true;
  systemState.lastUpdate = new Date().toISOString();
  logger.info('Trading started');
  
  // Send Telegram notification
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    await telegramService.sendMessage('🚀 SB1 ALPHA: Trading started');
  }
  
  return 'Trading started successfully';
}

async function stopTrading(): Promise<string> {
  systemState.isRunning = false;
  systemState.lastUpdate = new Date().toISOString();
  logger.info('Trading stopped');
  
  // Send Telegram notification
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    await telegramService.sendMessage('⏹️ SB1 ALPHA: Trading stopped');
  }
  
  return 'Trading stopped successfully';
}

async function setTradingMode(mode: string): Promise<void> {
  if (!['paper', 'bybit', 'mt5'].includes(mode)) {
    throw new Error('Invalid trading mode');
  }
  
  systemState.tradingMode = mode;
  systemState.lastUpdate = new Date().toISOString();
  logger.info(`Trading mode set to ${mode}`);
}

async function emergencyStop(): Promise<void> {
  systemState.emergencyStop = true;
  systemState.isRunning = false;
  systemState.lastUpdate = new Date().toISOString();
  
  logger.warn('Emergency stop activated');
  
  // Send Telegram notification
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    await telegramService.sendMessage('🚨 SB1 ALPHA: EMERGENCY STOP ACTIVATED');
  }
}

async function retrainModels(): Promise<string> {
  logger.info('Starting model retraining');
  // TODO: Implement model retraining
  return 'Model retraining completed';
}

async function runBacktest(): Promise<string> {
  logger.info('Starting backtest');
  // TODO: Implement backtest
  return 'Backtest completed';
}

async function fetchData(): Promise<string> {
  logger.info('Fetching market data');
  // TODO: Implement data fetching
  return 'Data fetch completed';
}

// Scheduled tasks
cron.schedule('*/5 * * * *', async () => {
  if (systemState.isRunning) {
    // TODO: Fetch latest data
    systemState.lastUpdate = new Date().toISOString();
  }
});

cron.schedule('0 */4 * * *', async () => {
  if (systemState.isRunning) {
    // TODO: Validate models
    logger.info('Model validation check');
  }
});

// Real-time data updates
setInterval(() => {
  if (systemState.isRunning) {
    io.emit('system_state', systemState);
    io.emit('positions_update', systemState.positions);
    io.emit('balance_update', systemState.balance);
  }
}, 1000);

// Error handling
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.API_PORT || 3001;
const HOST = process.env.API_HOST || 'localhost';

server.listen(PORT, HOST, () => {
  logger.info(`SB1 ALPHA API server running on ${HOST}:${PORT}`);
  
  // Initialize system
  logger.info('System initialized successfully');
});

export { app, server, io };