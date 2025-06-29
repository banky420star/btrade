import React from 'react'
import { useTradingContext } from '../contexts/TradingContext'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity,
  Brain,
  Shield,
  Zap
} from 'lucide-react'
import MetricCard from '../components/MetricCard'
import EquityCurve from '../components/EquityCurve'
import ModelStatus from '../components/ModelStatus'
import RecentTrades from '../components/RecentTrades'
import MQL5Dashboard from '../components/MQL5Dashboard'

export default function Dashboard() {
  const { state } = useTradingContext()

  const metrics = [
    {
      title: 'Total Equity',
      value: `$${state.balance.equity.toLocaleString()}`,
      change: state.metrics.dailyPnl,
      changeType: state.metrics.dailyPnl >= 0 ? 'positive' : 'negative',
      icon: DollarSign,
      color: 'blue'
    },
    {
      title: 'Daily P&L',
      value: `${state.metrics.dailyPnl >= 0 ? '+' : ''}$${state.metrics.dailyPnl.toFixed(2)}`,
      change: state.metrics.dailyPnl,
      changeType: state.metrics.dailyPnl >= 0 ? 'positive' : 'negative',
      icon: state.metrics.dailyPnl >= 0 ? TrendingUp : TrendingDown,
      color: state.metrics.dailyPnl >= 0 ? 'green' : 'red'
    },
    {
      title: 'Win Rate',
      value: `${(state.metrics.winRate * 100).toFixed(1)}%`,
      change: state.metrics.winRate,
      changeType: state.metrics.winRate >= 0.5 ? 'positive' : 'negative',
      icon: Activity,
      color: 'purple'
    },
    {
      title: 'Sharpe Ratio',
      value: state.metrics.sharpeRatio.toFixed(2),
      change: state.metrics.sharpeRatio,
      changeType: state.metrics.sharpeRatio >= 1 ? 'positive' : 'negative',
      icon: Zap,
      color: 'yellow'
    },
    {
      title: 'Active Models',
      value: `${state.models.filter(m => m.status === 'active').length}/${state.models.length}`,
      change: state.models.filter(m => m.status === 'active').length,
      changeType: 'neutral',
      icon: Brain,
      color: 'indigo'
    },
    {
      title: 'Open Positions',
      value: state.positions.length.toString(),
      change: state.positions.length,
      changeType: 'neutral',
      icon: Shield,
      color: 'gray'
    }
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trading Dashboard</h1>
          <p className="text-gray-600">
            System overview and key performance metrics
          </p>
        </div>
        <div className={`px-4 py-2 rounded-full text-sm font-medium ${
          state.systemStatus === 'online' 
            ? 'bg-success-100 text-success-800'
            : state.systemStatus === 'offline'
            ? 'bg-danger-100 text-danger-800'
            : 'bg-yellow-100 text-yellow-800'
        }`}>
          {state.systemStatus.charAt(0).toUpperCase() + state.systemStatus.slice(1)}
        </div>
      </div>

      {/* MQL5 Dashboard */}
      <MQL5Dashboard />

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {metrics.map((metric, index) => (
          <MetricCard key={index} {...metric} />
        ))}
      </div>

      {/* Charts and Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Equity Curve */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Equity Curve</h3>
          <EquityCurve />
        </div>

        {/* Model Status */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Model Status</h3>
          <ModelStatus models={state.models} />
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Trades</h3>
        <RecentTrades />
      </div>
    </div>
  )
}