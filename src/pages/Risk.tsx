import React, { useState } from 'react'
import { useTradingContext } from '../contexts/TradingContext'
import { 
  Shield, 
  AlertTriangle, 
  TrendingDown, 
  DollarSign,
  BarChart3,
  Settings,
  Save,
  RotateCcw,
  Activity,
  CheckCircle,
  XCircle
} from 'lucide-react'

export default function Risk() {
  const { state, executeCommand } = useTradingContext()
  const [riskConfig, setRiskConfig] = useState({
    maxPositionSize: 0.02,
    maxDailyLoss: 0.05,
    maxDrawdown: 0.15,
    maxCorrelation: 0.7,
    maxPositions: 10,
    stopLossATR: 2.0,
    takeProfitATR: 3.0,
    kellyFraction: 0.25,
    emergencyStop: false
  })

  const [isEditing, setIsEditing] = useState(false)

  const handleConfigChange = (key, value) => {
    setRiskConfig(prev => ({
      ...prev,
      [key]: value
    }))
  }

  const handleSaveConfig = async () => {
    await executeCommand(`update risk config ${JSON.stringify(riskConfig)}`)
    setIsEditing(false)
  }

  const handleResetConfig = () => {
    setRiskConfig({
      maxPositionSize: 0.02,
      maxDailyLoss: 0.05,
      maxDrawdown: 0.15,
      maxCorrelation: 0.7,
      maxPositions: 10,
      stopLossATR: 2.0,
      takeProfitATR: 3.0,
      kellyFraction: 0.25,
      emergencyStop: false
    })
  }

  const handleEmergencyStop = async () => {
    await executeCommand('emergency stop')
  }

  const handleResetEmergencyStop = async () => {
    await executeCommand('reset emergency stop')
  }

  const getRiskLevel = (value, threshold, type = 'lower') => {
    if (type === 'lower') {
      return value < threshold * 0.8 ? 'high' : value < threshold * 0.9 ? 'medium' : 'low'
    } else {
      return value > threshold * 1.2 ? 'high' : value > threshold * 1.1 ? 'medium' : 'low'
    }
  }

  const getRiskColor = (level) => {
    switch (level) {
      case 'high': return 'text-danger-600'
      case 'medium': return 'text-yellow-600'
      case 'low': return 'text-success-600'
      default: return 'text-gray-600'
    }
  }

  const getRiskBgColor = (level) => {
    switch (level) {
      case 'high': return 'bg-danger-100'
      case 'medium': return 'bg-yellow-100'
      case 'low': return 'bg-success-100'
      default: return 'bg-gray-100'
    }
  }

  // Mock risk metrics
  const riskMetrics = {
    currentDrawdown: 0.05,
    dailyPnL: -250,
    marginLevel: 450,
    positionCount: 3,
    totalExposure: 0.15,
    leverage: 1.5,
    correlationRisk: 0.3
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Risk Management</h1>
          <p className="text-gray-600">Risk controls and position sizing parameters</p>
        </div>
        <div className="flex space-x-3">
          {riskConfig.emergencyStop ? (
            <button
              onClick={handleResetEmergencyStop}
              className="btn-success px-4 py-2"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Reset Emergency Stop
            </button>
          ) : (
            <button
              onClick={handleEmergencyStop}
              className="btn-danger px-4 py-2"
            >
              <AlertTriangle className="h-4 w-4 mr-2" />
              Emergency Stop
            </button>
          )}
        </div>
      </div>

      {/* Risk Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Current Drawdown</p>
              <p className="text-2xl font-bold text-gray-900">{(riskMetrics.currentDrawdown * 100).toFixed(1)}%</p>
            </div>
            <div className={`p-2 rounded-full ${getRiskBgColor(getRiskLevel(riskMetrics.currentDrawdown, riskConfig.maxDrawdown))}`}>
              <TrendingDown className={`h-6 w-6 ${getRiskColor(getRiskLevel(riskMetrics.currentDrawdown, riskConfig.maxDrawdown))}`} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Daily P&L</p>
              <p className={`text-2xl font-bold ${riskMetrics.dailyPnL >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                ${riskMetrics.dailyPnL.toLocaleString()}
              </p>
            </div>
            <div className={`p-2 rounded-full ${getRiskBgColor(getRiskLevel(Math.abs(riskMetrics.dailyPnL), state.balance.equity * riskConfig.maxDailyLoss))}`}>
              <DollarSign className={`h-6 w-6 ${getRiskColor(getRiskLevel(Math.abs(riskMetrics.dailyPnL), state.balance.equity * riskConfig.maxDailyLoss))}`} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Margin Level</p>
              <p className="text-2xl font-bold text-gray-900">{riskMetrics.marginLevel.toFixed(0)}%</p>
            </div>
            <div className={`p-2 rounded-full ${getRiskBgColor(getRiskLevel(riskMetrics.marginLevel, 200, 'lower'))}`}>
              <BarChart3 className={`h-6 w-6 ${getRiskColor(getRiskLevel(riskMetrics.marginLevel, 200, 'lower'))}`} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Open Positions</p>
              <p className="text-2xl font-bold text-gray-900">{riskMetrics.positionCount}</p>
            </div>
            <div className={`p-2 rounded-full ${getRiskBgColor(getRiskLevel(riskMetrics.positionCount, riskConfig.maxPositions))}`}>
              <Activity className={`h-6 w-6 ${getRiskColor(getRiskLevel(riskMetrics.positionCount, riskConfig.maxPositions))}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Risk Configuration */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Risk Configuration</h3>
          <div className="flex space-x-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSaveConfig}
                  className="btn-primary px-4 py-2"
                >
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="btn-secondary px-4 py-2"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Edit
                </button>
                <button
                  onClick={handleResetConfig}
                  className="btn-danger px-4 py-2"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Position Sizing */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Position Sizing</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Position Size (%)
              </label>
              <input
                type="number"
                value={riskConfig.maxPositionSize * 100}
                onChange={(e) => handleConfigChange('maxPositionSize', parseFloat(e.target.value) / 100)}
                disabled={!isEditing}
                step="0.1"
                min="0.1"
                max="10"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Kelly Fraction
              </label>
              <input
                type="number"
                value={riskConfig.kellyFraction}
                onChange={(e) => handleConfigChange('kellyFraction', parseFloat(e.target.value))}
                disabled={!isEditing}
                step="0.01"
                min="0.01"
                max="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
              />
            </div>
          </div>

          {/* Loss Limits */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Loss Limits</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Daily Loss (%)
              </label>
              <input
                type="number"
                value={riskConfig.maxDailyLoss * 100}
                onChange={(e) => handleConfigChange('maxDailyLoss', parseFloat(e.target.value) / 100)}
                disabled={!isEditing}
                step="0.1"
                min="0.1"
                max="20"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Drawdown (%)
              </label>
              <input
                type="number"
                value={riskConfig.maxDrawdown * 100}
                onChange={(e) => handleConfigChange('maxDrawdown', parseFloat(e.target.value) / 100)}
                disabled={!isEditing}
                step="0.1"
                min="1"
                max="50"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
              />
            </div>
          </div>

          {/* Position Limits */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Position Limits</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Positions
              </label>
              <input
                type="number"
                value={riskConfig.maxPositions}
                onChange={(e) => handleConfigChange('maxPositions', parseInt(e.target.value))}
                disabled={!isEditing}
                min="1"
                max="50"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Correlation
              </label>
              <input
                type="number"
                value={riskConfig.maxCorrelation}
                onChange={(e) => handleConfigChange('maxCorrelation', parseFloat(e.target.value))}
                disabled={!isEditing}
                step="0.1"
                min="0.1"
                max="1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
              />
            </div>
          </div>

          {/* Stop Loss & Take Profit */}
          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">Stop Loss & Take Profit</h4>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Stop Loss (ATR Multiplier)
              </label>
              <input
                type="number"
                value={riskConfig.stopLossATR}
                onChange={(e) => handleConfigChange('stopLossATR', parseFloat(e.target.value))}
                disabled={!isEditing}
                step="0.1"
                min="0.5"
                max="10"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Take Profit (ATR Multiplier)
              </label>
              <input
                type="number"
                value={riskConfig.takeProfitATR}
                onChange={(e) => handleConfigChange('takeProfitATR', parseFloat(e.target.value))}
                disabled={!isEditing}
                step="0.1"
                min="0.5"
                max="20"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Risk Alerts */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Alerts</h3>
        <div className="space-y-3">
          {riskConfig.emergencyStop && (
            <div className="flex items-center p-4 bg-danger-50 border border-danger-200 rounded-lg">
              <XCircle className="h-5 w-5 text-danger-500 mr-3" />
              <div>
                <p className="font-medium text-danger-800">Emergency Stop Active</p>
                <p className="text-sm text-danger-600">All trading has been halted due to risk limits</p>
              </div>
            </div>
          )}
          
          {getRiskLevel(riskMetrics.currentDrawdown, riskConfig.maxDrawdown) === 'high' && (
            <div className="flex items-center p-4 bg-danger-50 border border-danger-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-danger-500 mr-3" />
              <div>
                <p className="font-medium text-danger-800">High Drawdown Risk</p>
                <p className="text-sm text-danger-600">Current drawdown is approaching maximum limit</p>
              </div>
            </div>
          )}
          
          {getRiskLevel(riskMetrics.marginLevel, 200, 'lower') === 'high' && (
            <div className="flex items-center p-4 bg-danger-50 border border-danger-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-danger-500 mr-3" />
              <div>
                <p className="font-medium text-danger-800">Low Margin Level</p>
                <p className="text-sm text-danger-600">Margin level is below safe threshold</p>
              </div>
            </div>
          )}
          
          {getRiskLevel(riskMetrics.positionCount, riskConfig.maxPositions) === 'high' && (
            <div className="flex items-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mr-3" />
              <div>
                <p className="font-medium text-yellow-800">Position Limit Warning</p>
                <p className="text-sm text-yellow-600">Approaching maximum number of positions</p>
              </div>
            </div>
          )}
          
          {riskMetrics.correlationRisk > riskConfig.maxCorrelation && (
            <div className="flex items-center p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-yellow-500 mr-3" />
              <div>
                <p className="font-medium text-yellow-800">High Correlation Risk</p>
                <p className="text-sm text-yellow-600">Portfolio correlation exceeds recommended limit</p>
              </div>
            </div>
          )}
          
          {!riskConfig.emergencyStop && 
           getRiskLevel(riskMetrics.currentDrawdown, riskConfig.maxDrawdown) !== 'high' &&
           getRiskLevel(riskMetrics.marginLevel, 200, 'lower') !== 'high' &&
           getRiskLevel(riskMetrics.positionCount, riskConfig.maxPositions) !== 'high' &&
           riskMetrics.correlationRisk <= riskConfig.maxCorrelation && (
            <div className="flex items-center p-4 bg-success-50 border border-success-200 rounded-lg">
              <CheckCircle className="h-5 w-5 text-success-500 mr-3" />
              <div>
                <p className="font-medium text-success-800">All Risk Metrics Normal</p>
                <p className="text-sm text-success-600">No risk alerts at this time</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Risk Metrics Summary */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Metrics Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Exposure</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Exposure</span>
                <span className="font-medium">{(riskMetrics.totalExposure * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Leverage</span>
                <span className="font-medium">{riskMetrics.leverage.toFixed(1)}x</span>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Performance</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Current Drawdown</span>
                <span className="font-medium">{(riskMetrics.currentDrawdown * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Daily P&L</span>
                <span className={`font-medium ${riskMetrics.dailyPnL >= 0 ? 'text-success-600' : 'text-danger-600'}`}>
                  ${riskMetrics.dailyPnL.toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Account</h4>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Margin Level</span>
                <span className="font-medium">{riskMetrics.marginLevel.toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Open Positions</span>
                <span className="font-medium">{riskMetrics.positionCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}