import winston from 'winston'
import path from 'path'
import fs from 'fs-extra'

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs')
fs.ensureDirSync(logsDir)

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
)

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta)}`
    }
    return msg
  })
)

// Create logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'algo-trader' },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // Trading specific log
    new winston.transports.File({
      filename: path.join(logsDir, 'trading.log'),
      level: 'info',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
})

// Add console transport for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: consoleFormat
  }))
}

// Trading-specific logger methods
class Logger {
  constructor() {
    this.logger = logger
  }

  info(message, meta = {}) {
    this.logger.info(message, meta)
  }

  warn(message, meta = {}) {
    this.logger.warn(message, meta)
  }

  error(message, meta = {}) {
    this.logger.error(message, meta)
  }

  debug(message, meta = {}) {
    this.logger.debug(message, meta)
  }

  // Trading specific methods
  trade(action, symbol, quantity, price, meta = {}) {
    this.logger.info('TRADE', {
      action,
      symbol,
      quantity,
      price,
      timestamp: new Date().toISOString(),
      ...meta
    })
  }

  position(symbol, side, size, entryPrice, currentPrice, pnl, meta = {}) {
    this.logger.info('POSITION', {
      symbol,
      side,
      size,
      entryPrice,
      currentPrice,
      pnl,
      timestamp: new Date().toISOString(),
      ...meta
    })
  }

  order(orderId, symbol, type, side, quantity, price, status, meta = {}) {
    this.logger.info('ORDER', {
      orderId,
      symbol,
      type,
      side,
      quantity,
      price,
      status,
      timestamp: new Date().toISOString(),
      ...meta
    })
  }

  model(modelName, action, accuracy, performance, meta = {}) {
    this.logger.info('MODEL', {
      modelName,
      action,
      accuracy,
      performance,
      timestamp: new Date().toISOString(),
      ...meta
    })
  }

  risk(riskType, value, threshold, action, meta = {}) {
    this.logger.warn('RISK', {
      riskType,
      value,
      threshold,
      action,
      timestamp: new Date().toISOString(),
      ...meta
    })
  }

  alert(level, message, data = {}) {
    this.logger[level]('ALERT', {
      level,
      message,
      data,
      timestamp: new Date().toISOString()
    })
  }

  // Performance metrics
  performance(metric, value, meta = {}) {
    this.logger.info('PERFORMANCE', {
      metric,
      value,
      timestamp: new Date().toISOString(),
      ...meta
    })
  }

  // System events
  system(event, status, meta = {}) {
    this.logger.info('SYSTEM', {
      event,
      status,
      timestamp: new Date().toISOString(),
      ...meta
    })
  }
}

export { Logger }
export default Logger