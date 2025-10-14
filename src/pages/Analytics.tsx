import React, { useState, useEffect } from 'react'
import { useTradingContext } from '../contexts/TradingContext'
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  DollarSign,
  Activity,
  Calendar,
  Download,
  RefreshCw,
  Target,
  Zap,
  Shield,
  Brain
} from 'lucide-react'

export default function Analytics() {
  const { state, executeCommand } = useTradingContext()
  const [selectedPeriod, setSelectedPeriod] = useState('7d')
  const [isLoading, setIsLoading] = useState(false)

  const periods = [
    { value: '1d', label: '1 Day' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' },
    { value: '90d', label: '90 Days' },
    { value: '1y', label: '1 Year' }
  ]

  // Mock analytics data
  const analyticsData = {
    performance: {
      totalReturn: 12.5,
      dailyReturn: 0.8,
      weeklyReturn: 5.2,
      monthlyReturn: 12.5,
      annualizedReturn: 45.6,
      volatility: 18.2,
      sharpeRatio: 2.51,
      calmarRatio: 1.89,
      maxDrawdown: 8.3,
      winRate: 68.5,
      profitFactor: 1.85,
      avgWin: 2.1,
      avgLoss: -1.2,
      totalTrades: 1247,
      winningTrades: 854,
      losingTrades: 393
    },
    equity: [
      { date: '2024-01-01', value: 10000 },
      { date: '2024-01-02', value: 10120 },
      { date: '2024-01-03', value: 9980 },
      { date: '2024-01-04', value: 10250 },
      { date: '2024-01-05', value: 10380 },
      { date: '2024-01-06', value: 10190 },
      { date: '2024-01-07', value: 10520 },
      { date: '2024-01-08', value: 10750 },
      { date: '2024-01-09', value: 10620 },
      { date: '2024-01-10', value: 10890 },
      { date: '2024-01-11', value: 11050 },
      { date: '2024-01-12', value: 10980 },
      { date: '2024-01-13', value: 11250 },
      { date: '2024-01-14', value: 11120 },
      { date: '2024-01-15', value: 11250 }
    ],
    drawdown: [
      { date: '2024-01-01', value: 0 },
      { date: '2024-01-02', value: 0 },
      { date: '2024-01-03', value: -2.0 },
      { date: '2024-01-04', value: 0 },
      { date: '2024-01-05', value: 0 },
      { date: '2024-01-06', value: -1.5 },
      { date: '2024-01-07', value: 0 },
      { date: '2024-01-08', value: 0 },
      { date: '2024-01-09', value: -1.2 },
      { date: '2024-01-10', value: 0 },
      { date: '2024-01-11', value: 0 },
      { date: '2024-01-12', value: -0.6 },
      { date: '2024-01-13', value: 0 },
      { date: '2024-01-14', value: -1.1 },
      { date: '2024-01-15', value: 0 }
    ],
    monthlyReturns: [
      { month: 'Jan', return: 12.5 },
      { month: 'Feb', return: 8.2 },
      { month: 'Mar', return: -3.1 },
      { month: 'Apr', return: 15.8 },
      { month: 'May', return: 6.4 },
      { month: 'Jun', return: 9.7 }
    ],
    symbolPerformance: [
      { symbol: 'EUR/USD', trades: 245, winRate: 72.3, pnl: 1250 },
      { symbol: 'GBP/USD', trades: 198, winRate: 68.7, pnl: 890 },
      { symbol: 'USD/JPY', trades: 187, winRate: 65.2, pnl: 650 },
      { symbol: 'AUD/USD', trades: 156, winRate: 71.8, pnl: 420 },
      { symbol: 'USD/CAD', trades: 134, winRate: 69.4, pnl: 380 },
      { symbol: 'USD/CHF', trades: 123, winRate: 66.7, pnl: 210 },
      { symbol: 'NZD/USD', trades: 98, winRate: 70.4, pnl: 180 }
    ]
  }

  const handleRefresh = async () => {
    setIsLoading(true)
    await executeCommand('refresh analytics')
    setTimeout(() => setIsLoading(false), 1000)
  }

  const handleExport = async () => {
    await executeCommand('export analytics')
  }

  const handleBacktest = async () => {
    await executeCommand('run backtest')
  }

  const getReturnColor = (value) => {
    if (value > 0) return 'text-success-600'
    if (value < 0) return 'text-danger-600'
    return 'text-gray-600'
  }

  const getReturnBgColor = (value) => {
    if (value > 0) return 'bg-success-100'
    if (value < 0) return 'bg-danger-100'
    return 'bg-gray-100'
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600">Performance metrics and backtesting results</p>
        </div>
        <div className="flex items-center space-x-3">
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {periods.map(period => (
              <option key={period.value} value={period.value}>{period.label}</option>
            ))}
          </select>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="btn-secondary px-4 py-2 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleExport}
            className="btn-secondary px-4 py-2"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </button>
          <button
            onClick={handleBacktest}
            className="btn-primary px-4 py-2"
          >
            <Target className="h-4 w-4 mr-2" />
            Backtest
          </button>
        </div>
      </div>

      {/* Key Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Return</p>
              <p className={`text-2xl font-bold ${getReturnColor(analyticsData.performance.totalReturn)}`}>
                {analyticsData.performance.totalReturn >= 0 ? '+' : ''}{analyticsData.performance.totalReturn}%
              </p>
            </div>
            <div className={`p-2 rounded-full ${getReturnBgColor(analyticsData.performance.totalReturn)}`}>
              <TrendingUp className={`h-6 w-6 ${getReturnColor(analyticsData.performance.totalReturn)}`} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Sharpe Ratio</p>
              <p className="text-2xl font-bold text-gray-900">{analyticsData.performance.sharpeRatio}</p>
            </div>
            <div className="p-2 rounded-full bg-primary-100">
              <Zap className="h-6 w-6 text-primary-600" />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Max Drawdown</p>
              <p className="text-2xl font-bold text-danger-600">{analyticsData.performance.maxDrawdown}%</p>
            </div>
            <div className="p-2 rounded-full bg-danger-100">
              <TrendingDown className="h-6 w-6 text-danger-600" />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Win Rate</p>
              <p className="text-2xl font-bold text-gray-900">{analyticsData.performance.winRate}%</p>
            </div>
            <div className="p-2 rounded-full bg-success-100">
              <Target className="h-6 w-6 text-success-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Equity Curve */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Equity Curve</h3>
          <div className="h-64 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>Equity curve chart will be displayed here</p>
            </div>
          </div>
        </div>

        {/* Drawdown Chart */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Drawdown</h3>
          <div className="h-64 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <TrendingDown className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>Drawdown chart will be displayed here</p>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Performance Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Summary */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Summary</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Annualized Return</p>
                <p className={`text-xl font-bold ${getReturnColor(analyticsData.performance.annualizedReturn)}`}>
                  {analyticsData.performance.annualizedReturn}%
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Volatility</p>
                <p className="text-xl font-bold text-gray-900">{analyticsData.performance.volatility}%</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Calmar Ratio</p>
                <p className="text-xl font-bold text-gray-900">{analyticsData.performance.calmarRatio}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Profit Factor</p>
                <p className="text-xl font-bold text-gray-900">{analyticsData.performance.profitFactor}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Trade Statistics */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Trade Statistics</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Trades</p>
                <p className="text-xl font-bold text-gray-900">{analyticsData.performance.totalTrades.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Winning Trades</p>
                <p className="text-xl font-bold text-success-600">{analyticsData.performance.winningTrades.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Losing Trades</p>
                <p className="text-xl font-bold text-danger-600">{analyticsData.performance.losingTrades.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Win</p>
                <p className="text-xl font-bold text-success-600">${analyticsData.performance.avgWin}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Avg Loss</p>
                <p className="text-xl font-bold text-danger-600">${analyticsData.performance.avgLoss}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Win Rate</p>
                <p className="text-xl font-bold text-gray-900">{analyticsData.performance.winRate}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Returns */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Returns</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {analyticsData.monthlyReturns.map((month, index) => (
            <div key={index} className="text-center">
              <div className={`p-4 rounded-lg ${getReturnBgColor(month.return)}`}>
                <p className="text-sm text-gray-600">{month.month}</p>
                <p className={`text-lg font-bold ${getReturnColor(month.return)}`}>
                  {month.return >= 0 ? '+' : ''}{month.return}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Symbol Performance */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Symbol Performance</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trades</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Win Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P&L</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Performance</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {analyticsData.symbolPerformance.map((symbol, index) => (
                <tr key={index}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {symbol.symbol}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {symbol.trades}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {symbol.winRate}%
                  </td>
                  <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getReturnColor(symbol.pnl)}`}>
                    {symbol.pnl >= 0 ? '+' : ''}${symbol.pnl.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center">
                      <div className="w-16 bg-gray-200 rounded-full h-2 mr-2">
                        <div 
                          className={`h-2 rounded-full ${symbol.winRate >= 70 ? 'bg-success-500' : symbol.winRate >= 60 ? 'bg-yellow-500' : 'bg-danger-500'}`}
                          style={{ width: `${symbol.winRate}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500">{symbol.winRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Model Performance */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Model Performance</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {state.models.map((model) => (
            <div key={model.type} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-3">
                <Brain className="h-5 w-5 text-gray-400" />
                <div>
                  <h4 className="font-medium text-gray-900">{model.name}</h4>
                  <p className="text-sm text-gray-600">{model.type}</p>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Accuracy</span>
                  <span className="text-sm font-medium">{(model.accuracy * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Performance</span>
                  <span className="text-sm font-medium">{model.performance.toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Status</span>
                  <span className={`text-sm font-medium px-2 py-1 rounded-full ${
                    model.status === 'active' ? 'bg-success-100 text-success-800' :
                    model.status === 'training' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-danger-100 text-danger-800'
                  }`}>
                    {model.status.toUpperCase()}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}