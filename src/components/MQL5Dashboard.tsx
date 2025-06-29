import React, { useEffect, useRef, useState } from 'react'
import { TrendingUp, TrendingDown, Activity, Brain, AlertCircle, RefreshCw } from 'lucide-react'

// Declare MQL5 widget types
declare global {
  interface Window {
    MQL5: {
      widget: {
        Chart: any
        Ticker: any
        CurrencyMatrix: any
        init: () => void
      }
    }
  }
}

interface Position {
  id: string
  symbol: string
  type: 'buy' | 'sell'
  volume: number
  openPrice: number
  currentPrice: number
  pnl: number
  sl?: number
  tp?: number
  openTime: string
}

interface ModelMetrics {
  name: string
  accuracy: number
  lastUpdate: string
  status: 'training' | 'active' | 'offline'
  performance: number
}

export default function MQL5Dashboard() {
  const chartRef = useRef<HTMLDivElement>(null)
  const tickerRef = useRef<HTMLDivElement>(null)
  const matrixRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdate, setLastUpdate] = useState(new Date())

  // Mock data for demonstration
  const [positions] = useState<Position[]>([
    {
      id: '1',
      symbol: 'EURUSD',
      type: 'buy',
      volume: 0.1,
      openPrice: 1.0850,
      currentPrice: 1.0875,
      pnl: 25.00,
      sl: 1.0800,
      tp: 1.0950,
      openTime: '2024-01-15 09:30:00'
    },
    {
      id: '2',
      symbol: 'GBPUSD',
      type: 'sell',
      volume: 0.05,
      openPrice: 1.2650,
      currentPrice: 1.2625,
      pnl: 12.50,
      sl: 1.2700,
      tp: 1.2550,
      openTime: '2024-01-15 10:15:00'
    }
  ])

  const [modelMetrics] = useState<ModelMetrics[]>([
    {
      name: 'Random Forest',
      accuracy: 68.5,
      lastUpdate: '2024-01-15 11:30:00',
      status: 'active',
      performance: 85.2
    },
    {
      name: 'LSTM Neural Net',
      accuracy: 72.1,
      lastUpdate: '2024-01-15 11:25:00',
      status: 'active',
      performance: 78.9
    },
    {
      name: 'DDQN Agent',
      accuracy: 65.8,
      lastUpdate: '2024-01-15 11:20:00',
      status: 'training',
      performance: 71.3
    }
  ])

  useEffect(() => {
    const loadMQL5Widgets = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Load MQL5 widget script
        const script = document.createElement('script')
        script.src = 'https://c.mql5.com/js/widgets/widget.js'
        script.async = true
        
        script.onload = () => {
          initializeWidgets()
        }
        
        script.onerror = () => {
          setError('Failed to load MQL5 widgets')
          setIsLoading(false)
        }

        document.head.appendChild(script)

        return () => {
          document.head.removeChild(script)
        }
      } catch (err) {
        setError('Error initializing MQL5 widgets')
        setIsLoading(false)
      }
    }

    const initializeWidgets = () => {
      try {
        // Initialize Candlestick Chart
        if (chartRef.current && window.MQL5) {
          new window.MQL5.widget.Chart({
            container_id: 'mql5-chart-widget',
            width: 340,
            height: 200,
            symbol: 'EURUSD',
            interval: 'D1',
            timezone: 'Etc/UTC',
            theme: 'light',
            style: '1',
            locale: 'en',
            toolbar_bg: '#f1f3f6',
            enable_publishing: false,
            hide_top_toolbar: false,
            hide_legend: false,
            save_image: false,
            container_id: 'mql5-chart-widget'
          })
        }

        // Initialize Ticker Banner
        if (tickerRef.current && window.MQL5) {
          new window.MQL5.widget.Ticker({
            container_id: 'mql5-ticker-widget',
            symbols: [
              'EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD', 
              'USDCAD', 'USDCHF', 'NZDUSD'
            ],
            theme: 'light',
            locale: 'en',
            width: '100%',
            height: 50
          })
        }

        // Initialize Currency Matrix
        if (matrixRef.current && window.MQL5) {
          new window.MQL5.widget.CurrencyMatrix({
            container_id: 'mql5-matrix-widget',
            width: 700,
            height: 420,
            currencies: ['EUR', 'USD', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'NZD'],
            theme: 'light',
            locale: 'en'
          })
        }

        setIsLoading(false)
      } catch (err) {
        setError('Error initializing widgets')
        setIsLoading(false)
      }
    }

    loadMQL5Widgets()

    // Set up refresh interval
    const refreshInterval = setInterval(() => {
      setLastUpdate(new Date())
    }, 1000)

    return () => {
      clearInterval(refreshInterval)
    }
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-success-700 bg-success-100'
      case 'training':
        return 'text-yellow-700 bg-yellow-100'
      case 'offline':
        return 'text-danger-700 bg-danger-100'
      default:
        return 'text-gray-700 bg-gray-100'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Activity className="h-4 w-4 text-success-500" />
      case 'training':
        return <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />
      case 'offline':
        return <AlertCircle className="h-4 w-4 text-danger-500" />
      default:
        return <Brain className="h-4 w-4 text-gray-500" />
    }
  }

  if (error) {
    return (
      <div className="p-6 bg-danger-50 border border-danger-200 rounded-lg">
        <div className="flex items-center">
          <AlertCircle className="h-5 w-5 text-danger-500 mr-2" />
          <span className="text-danger-700 font-medium">Error loading dashboard: {error}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Last Update */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">MQL5 Trading Dashboard</h1>
        <div className="flex items-center space-x-2 text-sm text-gray-600">
          <Activity className="h-4 w-4" />
          <span>Last Update: {lastUpdate.toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Live Ticker Banner */}
      <div className="w-full">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-2 bg-gray-50 border-b border-gray-200">
            <h3 className="text-sm font-medium text-gray-700">Live Market Ticker</h3>
          </div>
          <div 
            id="mql5-ticker-widget" 
            ref={tickerRef}
            className="w-full h-12"
            style={{ minHeight: '50px' }}
          >
            {isLoading && (
              <div className="flex items-center justify-center h-12 text-gray-500">
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Loading ticker...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Primary Market Analysis */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">EURUSD Daily Chart</h3>
              <p className="text-sm text-gray-600">Candlestick with EMA overlays</p>
            </div>
            <div className="p-4">
              <div 
                id="mql5-chart-widget" 
                ref={chartRef}
                className="w-full"
                style={{ width: '340px', height: '200px' }}
              >
                {isLoading && (
                  <div className="flex items-center justify-center h-48 text-gray-500">
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    Loading chart...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Currency Matrix */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Currency Strength Matrix</h3>
              <p className="text-sm text-gray-600">8×8 cross-rate analysis with heat mapping</p>
            </div>
            <div className="p-4">
              <div 
                id="mql5-matrix-widget" 
                ref={matrixRef}
                className="w-full"
                style={{ width: '700px', height: '420px', maxWidth: '100%' }}
              >
                {isLoading && (
                  <div className="flex items-center justify-center h-96 text-gray-500">
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                    Loading currency matrix...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trading Performance and Model Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Positions Panel */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Active Positions</h3>
            <p className="text-sm text-gray-600">Current open trades and P&L</p>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {positions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No active positions
                </div>
              ) : (
                positions.map((position) => (
                  <div key={position.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">{position.symbol}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          position.type === 'buy' 
                            ? 'bg-success-100 text-success-800' 
                            : 'bg-danger-100 text-danger-800'
                        }`}>
                          {position.type.toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-600">{position.volume} lots</span>
                      </div>
                      <div className={`font-medium ${
                        position.pnl >= 0 ? 'text-success-600' : 'text-danger-600'
                      }`}>
                        {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <span>Entry: {position.openPrice}</span>
                        <br />
                        <span>Current: {position.currentPrice}</span>
                      </div>
                      <div>
                        {position.sl && <span>SL: {position.sl}<br /></span>}
                        {position.tp && <span>TP: {position.tp}</span>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ML Model Status */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">ML Model Analytics</h3>
            <p className="text-sm text-gray-600">Training progress and performance metrics</p>
          </div>
          <div className="p-4">
            <div className="space-y-4">
              {modelMetrics.map((model, index) => (
                <div key={index} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(model.status)}
                      <span className="font-medium text-gray-900">{model.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(model.status)}`}>
                        {model.status.charAt(0).toUpperCase() + model.status.slice(1)}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Accuracy:</span>
                      <span className="ml-2 font-medium text-gray-900">{model.accuracy}%</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Performance:</span>
                      <span className="ml-2 font-medium text-gray-900">{model.performance}%</span>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Last Update: {new Date(model.lastUpdate).toLocaleString()}
                  </div>
                  
                  {/* Progress Bar for Training Models */}
                  {model.status === 'training' && (
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-yellow-500 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${model.performance}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Performance Summary */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Performance Summary</h3>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-success-600">+$37.50</div>
              <div className="text-sm text-gray-600">Total P&L</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">2</div>
              <div className="text-sm text-gray-600">Open Positions</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary-600">68.5%</div>
              <div className="text-sm text-gray-600">Win Rate</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-900">3/3</div>
              <div className="text-sm text-gray-600">Models Active</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}