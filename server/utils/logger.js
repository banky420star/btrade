import winston from 'winston'
import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export class Logger {
  constructor() {
    // Create logs directory
    const logsDir = path.join(__dirname, '../../logs')
    fs.ensureDirSync(logsDir)
    
    // Define log format
    const logFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss'
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    )
    
    // Define console format
    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({
        format: 'HH:mm:ss'
      }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let msg = `${timestamp} [${level}]: ${message}`
        if (Object.keys(meta).length > 0) {
          msg += ` ${JSON.stringify(meta)}`
        }
        return msg
      })
    )
    
    // Create logger instance
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: logFormat,
      defaultMeta: { service: 'algo-trading-system' },
      transports: [
        // Console transport
        new winston.transports.Console({
          format: consoleFormat
        }),
        
        // File transport for all logs
        new winston.transports.File({
          filename: path.join(logsDir, 'combined.log'),
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        
        // File transport for errors only
        new winston.transports.File({
          filename: path.join(logsDir, 'error.log'),
          level: 'error',
          maxsize: 5242880, // 5MB
          maxFiles: 5
        }),
        
        // File transport for trading logs
        new winston.transports.File({
          filename: path.join(logsDir, 'trading.log'),
          level: 'info',
          maxsize: 5242880, // 5MB
          maxFiles: 10,
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
          )
        })
      ]
    })
    
    // Add custom methods
    this.addCustomMethods()
  }
  
  addCustomMethods() {
    // Trading specific log methods
    this.logger.trade = (message, meta = {}) => {
      this.logger.info(`[TRADE] ${message}`, { ...meta, category: 'trading' })
    }
    
    this.logger.signal = (message, meta = {}) => {
      this.logger.info(`[SIGNAL] ${message}`, { ...meta, category: 'signal' })
    }
    
    this.logger.risk = (message, meta = {}) => {
      this.logger.warn(`[RISK] ${message}`, { ...meta, category: 'risk' })
    }
    
    this.logger.model = (message, meta = {}) => {
      this.logger.info(`[MODEL] ${message}`, { ...meta, category: 'model' })
    }
    
    this.logger.data = (message, meta = {}) => {
      this.logger.info(`[DATA] ${message}`, { ...meta, category: 'data' })
    }
    
    this.logger.performance = (message, meta = {}) => {
      this.logger.info(`[PERFORMANCE] ${message}`, { ...meta, category: 'performance' })
    }
    
    this.logger.alert = (message, meta = {}) => {
      this.logger.warn(`[ALERT] ${message}`, { ...meta, category: 'alert' })
    }
    
    this.logger.emergency = (message, meta = {}) => {
      this.logger.error(`[EMERGENCY] ${message}`, { ...meta, category: 'emergency' })
    }
  }
  
  // Standard log methods
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
  trade(message, meta = {}) {
    this.logger.trade(message, meta)
  }
  
  signal(message, meta = {}) {
    this.logger.signal(message, meta)
  }
  
  risk(message, meta = {}) {
    this.logger.risk(message, meta)
  }
  
  model(message, meta = {}) {
    this.logger.model(message, meta)
  }
  
  data(message, meta = {}) {
    this.logger.data(message, meta)
  }
  
  performance(message, meta = {}) {
    this.logger.performance(message, meta)
  }
  
  alert(message, meta = {}) {
    this.logger.alert(message, meta)
  }
  
  emergency(message, meta = {}) {
    this.logger.emergency(message, meta)
  }
  
  // Utility methods
  getLogger() {
    return this.logger
  }
  
  setLevel(level) {
    this.logger.level = level
  }
  
  // Create child logger with additional context
  child(defaultMeta = {}) {
    return this.logger.child(defaultMeta)
  }
}