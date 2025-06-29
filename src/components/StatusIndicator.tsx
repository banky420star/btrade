import React from 'react'
import { useTradingContext } from '../contexts/TradingContext'
import { Activity, AlertCircle, CheckCircle, Clock } from 'lucide-react'

export default function StatusIndicator() {
  const { state } = useTradingContext()

  const getStatusIcon = () => {
    switch (state.systemStatus) {
      case 'online':
        return <CheckCircle className="h-4 w-4 text-success-500" />
      case 'offline':
        return <AlertCircle className="h-4 w-4 text-danger-500" />
      case 'maintenance':
        return <Clock className="h-4 w-4 text-yellow-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  const getStatusColor = () => {
    switch (state.systemStatus) {
      case 'online':
        return 'text-success-700'
      case 'offline':
        return 'text-danger-700'
      case 'maintenance':
        return 'text-yellow-700'
      default:
        return 'text-gray-700'
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-900">System Status</span>
        {getStatusIcon()}
      </div>
      
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Status</span>
          <span className={`font-medium capitalize ${getStatusColor()}`}>
            {state.systemStatus}
          </span>
        </div>
        
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Mode</span>
          <span className={`font-medium uppercase ${
            state.tradingMode === 'live' ? 'text-danger-700' : 'text-success-700'
          }`}>
            {state.tradingMode}
          </span>
        </div>
        
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Models</span>
          <span className="font-medium text-gray-900">
            {state.models.filter(m => m.status === 'active').length}/{state.models.length}
          </span>
        </div>
        
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Positions</span>
          <span className="font-medium text-gray-900">
            {state.positions.length}
          </span>
        </div>
      </div>
      
      <div className="pt-2 border-t border-gray-200">
        <div className="flex justify-between text-xs">
          <span className="text-gray-600">Equity</span>
          <span className="font-medium text-gray-900">
            ${state.balance.equity.toLocaleString()}
          </span>
        </div>
        
        <div className="flex justify-between text-xs mt-1">
          <span className="text-gray-600">Daily P&L</span>
          <span className={`font-medium ${
            state.metrics.dailyPnl >= 0 ? 'text-success-700' : 'text-danger-700'
          }`}>
            {state.metrics.dailyPnl >= 0 ? '+' : ''}${state.metrics.dailyPnl.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  )
}