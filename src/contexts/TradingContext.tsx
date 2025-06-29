import React, { createContext, useContext, useReducer, useEffect } from 'react'
import { io, Socket } from 'socket.io-client'

interface TradingState {
  isConnected: boolean
  tradingMode: 'paper' | 'live'
  systemStatus: 'online' | 'offline' | 'maintenance'
  positions: Position[]
  orders: Order[]
  balance: AccountBalance
  models: ModelStatus[]
  metrics: TradingMetrics
  alerts: Alert[]
}

interface Position {
  id: string
  symbol: string
  side: 'long' | 'short'
  size: number
  entryPrice: number
  currentPrice: number
  pnl: number
  pnlPercent: number
  timestamp: string
}

interface Order {
  id: string
  symbol: string
  type: 'market' | 'limit' | 'stop'
  side: 'buy' | 'sell'
  size: number
  price?: number
  status: 'pending' | 'filled' | 'cancelled'
  timestamp: string
}

interface AccountBalance {
  equity: number
  balance: number
  margin: number
  freeMargin: number
  marginLevel: number
}

interface ModelStatus {
  name: string
  type: 'rf' | 'lstm' | 'ddqn'
  status: 'active' | 'training' | 'offline'
  accuracy: number
  lastUpdate: string
  version: string
}

interface TradingMetrics {
  totalTrades: number
  winRate: number
  profitFactor: number
  sharpeRatio: number
  maxDrawdown: number
  dailyPnl: number
  weeklyPnl: number
  monthlyPnl: number
}

interface Alert {
  id: string
  type: 'info' | 'warning' | 'error' | 'success'
  message: string
  timestamp: string
  read: boolean
}

type TradingAction = 
  | { type: 'SET_CONNECTION'; payload: boolean }
  | { type: 'SET_TRADING_MODE'; payload: 'paper' | 'live' }
  | { type: 'SET_SYSTEM_STATUS'; payload: 'online' | 'offline' | 'maintenance' }
  | { type: 'UPDATE_POSITIONS'; payload: Position[] }
  | { type: 'UPDATE_ORDERS'; payload: Order[] }
  | { type: 'UPDATE_BALANCE'; payload: AccountBalance }
  | { type: 'UPDATE_MODELS'; payload: ModelStatus[] }
  | { type: 'UPDATE_METRICS'; payload: TradingMetrics }
  | { type: 'ADD_ALERT'; payload: Alert }
  | { type: 'MARK_ALERT_READ'; payload: string }

const initialState: TradingState = {
  isConnected: false,
  tradingMode: 'paper',
  systemStatus: 'offline',
  positions: [],
  orders: [],
  balance: {
    equity: 10000,
    balance: 10000,
    margin: 0,
    freeMargin: 10000,
    marginLevel: 0
  },
  models: [
    {
      name: 'Random Forest',
      type: 'rf',
      status: 'active',
      accuracy: 0.68,
      lastUpdate: new Date().toISOString(),
      version: '1.2.3'
    },
    {
      name: 'LSTM Forecaster',
      type: 'lstm',
      status: 'active',
      accuracy: 0.72,
      lastUpdate: new Date().toISOString(),
      version: '2.1.0'
    },
    {
      name: 'DDQN Agent',
      type: 'ddqn',
      status: 'active',
      accuracy: 0.65,
      lastUpdate: new Date().toISOString(),
      version: '1.5.2'
    }
  ],
  metrics: {
    totalTrades: 0,
    winRate: 0,
    profitFactor: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    dailyPnl: 0,
    weeklyPnl: 0,
    monthlyPnl: 0
  },
  alerts: []
}

function tradingReducer(state: TradingState, action: TradingAction): TradingState {
  switch (action.type) {
    case 'SET_CONNECTION':
      return { ...state, isConnected: action.payload }
    case 'SET_TRADING_MODE':
      return { ...state, tradingMode: action.payload }
    case 'SET_SYSTEM_STATUS':
      return { ...state, systemStatus: action.payload }
    case 'UPDATE_POSITIONS':
      return { ...state, positions: action.payload }
    case 'UPDATE_ORDERS':
      return { ...state, orders: action.payload }
    case 'UPDATE_BALANCE':
      return { ...state, balance: action.payload }
    case 'UPDATE_MODELS':
      return { ...state, models: action.payload }
    case 'UPDATE_METRICS':
      return { ...state, metrics: action.payload }
    case 'ADD_ALERT':
      return { 
        ...state, 
        alerts: [action.payload, ...state.alerts].slice(0, 50) // Keep last 50 alerts
      }
    case 'MARK_ALERT_READ':
      return {
        ...state,
        alerts: state.alerts.map(alert => 
          alert.id === action.payload ? { ...alert, read: true } : alert
        )
      }
    default:
      return state
  }
}

interface TradingContextType {
  state: TradingState
  dispatch: React.Dispatch<TradingAction>
  socket: Socket | null
  executeCommand: (command: string) => Promise<void>
  toggleTradingMode: () => void
  emergencyStop: () => void
}

const TradingContext = createContext<TradingContextType | undefined>(undefined)

export function TradingProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(tradingReducer, initialState)
  const [socket, setSocket] = React.useState<Socket | null>(null)

  useEffect(() => {
    const newSocket = io('http://localhost:8000')
    setSocket(newSocket)

    newSocket.on('connect', () => {
      dispatch({ type: 'SET_CONNECTION', payload: true })
      dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'online' })
    })

    newSocket.on('disconnect', () => {
      dispatch({ type: 'SET_CONNECTION', payload: false })
      dispatch({ type: 'SET_SYSTEM_STATUS', payload: 'offline' })
    })

    newSocket.on('positions_update', (positions: Position[]) => {
      dispatch({ type: 'UPDATE_POSITIONS', payload: positions })
    })

    newSocket.on('orders_update', (orders: Order[]) => {
      dispatch({ type: 'UPDATE_ORDERS', payload: orders })
    })

    newSocket.on('balance_update', (balance: AccountBalance) => {
      dispatch({ type: 'UPDATE_BALANCE', payload: balance })
    })

    newSocket.on('models_update', (models: ModelStatus[]) => {
      dispatch({ type: 'UPDATE_MODELS', payload: models })
    })

    newSocket.on('metrics_update', (metrics: TradingMetrics) => {
      dispatch({ type: 'UPDATE_METRICS', payload: metrics })
    })

    newSocket.on('alert', (alert: Alert) => {
      dispatch({ type: 'ADD_ALERT', payload: alert })
    })

    return () => {
      newSocket.close()
    }
  }, [])

  const executeCommand = async (command: string) => {
    if (!socket) return
    
    socket.emit('execute_command', { command })
    
    dispatch({
      type: 'ADD_ALERT',
      payload: {
        id: Date.now().toString(),
        type: 'info',
        message: `Executing command: ${command}`,
        timestamp: new Date().toISOString(),
        read: false
      }
    })
  }

  const toggleTradingMode = () => {
    const newMode = state.tradingMode === 'paper' ? 'live' : 'paper'
    dispatch({ type: 'SET_TRADING_MODE', payload: newMode })
    
    if (socket) {
      socket.emit('set_trading_mode', { mode: newMode })
    }
    
    dispatch({
      type: 'ADD_ALERT',
      payload: {
        id: Date.now().toString(),
        type: 'warning',
        message: `Switched to ${newMode} trading mode`,
        timestamp: new Date().toISOString(),
        read: false
      }
    })
  }

  const emergencyStop = () => {
    if (socket) {
      socket.emit('emergency_stop')
    }
    
    dispatch({
      type: 'ADD_ALERT',
      payload: {
        id: Date.now().toString(),
        type: 'error',
        message: 'Emergency stop activated - All trading halted',
        timestamp: new Date().toISOString(),
        read: false
      }
    })
  }

  return (
    <TradingContext.Provider value={{
      state,
      dispatch,
      socket,
      executeCommand,
      toggleTradingMode,
      emergencyStop
    }}>
      {children}
    </TradingContext.Provider>
  )
}

export function useTradingContext() {
  const context = useContext(TradingContext)
  if (context === undefined) {
    throw new Error('useTradingContext must be used within a TradingProvider')
  }
  return context
}