import React, { useState, useEffect } from 'react'
import { useTradingContext } from '../contexts/TradingContext'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Activity,
  Play,
  Pause,
  Square,
  AlertTriangle,
  BarChart3,
  Settings
} from 'lucide-react'

export default function Trading() {
  const { state, executeCommand } = useTradingContext()
  const [selectedSymbol, setSelectedSymbol] = useState('EUR/USD')
  const [orderType, setOrderType] = useState('market')
  const [orderSide, setOrderSide] = useState('buy')
  const [orderSize, setOrderSize] = useState(0.1)
  const [orderPrice, setOrderPrice] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [takeProfit, setTakeProfit] = useState('')

  const symbols = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD', 'USD/CAD', 'USD/CHF', 'NZD/USD']

  const handlePlaceOrder = async () => {
    const orderCommand = `place order ${selectedSymbol} ${orderSide} ${orderSize} ${orderType}${orderPrice ? ` ${orderPrice}` : ''}${stopLoss ? ` sl:${stopLoss}` : ''}${takeProfit ? ` tp:${takeProfit}` : ''}`
    await executeCommand(orderCommand)
  }

  const handleClosePosition = async (positionId) => {
    await executeCommand(`close position ${positionId}`)
  }

  const handleCloseAllPositions = async () => {
    await executeCommand('close all positions')
  }

  const getPnLColor = (pnl) => {
    if (pnl > 0) return 'text-success-600'
    if (pnl < 0) return 'text-danger-600'
    return 'text-gray-600'
  }

  const getSideColor = (side) => {
    return side === 'long' ? 'text-success-600' : 'text-danger-600'
  }

  const getSideIcon = (side) => {
    return side === 'long' ? TrendingUp : TrendingDown
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trading</h1>
          <p className="text-gray-600">Live trading interface and position management</p>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            state.systemStatus === 'online' 
              ? 'bg-success-100 text-success-800'
              : 'bg-danger-100 text-danger-800'
          }`}>
            {state.systemStatus === 'online' ? 'Online' : 'Offline'}
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium ${
            state.tradingMode === 'live' 
              ? 'bg-danger-100 text-danger-800'
              : 'bg-success-100 text-success-800'
          }`}>
            {state.tradingMode.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Trading Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Entry */}
        <div className="lg:col-span-2">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Place Order</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Symbol Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Symbol</label>
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {symbols.map(symbol => (
                    <option key={symbol} value={symbol}>{symbol}</option>
                  ))}
                </select>
              </div>

              {/* Order Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Order Type</label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                  <option value="stop">Stop</option>
                </select>
              </div>

              {/* Side */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Side</label>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setOrderSide('buy')}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium ${
                      orderSide === 'buy'
                        ? 'bg-success-100 text-success-800 border border-success-300'
                        : 'bg-gray-100 text-gray-700 border border-gray-300'
                    }`}
                  >
                    <TrendingUp className="h-4 w-4 inline mr-1" />
                    Buy
                  </button>
                  <button
                    onClick={() => setOrderSide('sell')}
                    className={`flex-1 px-4 py-2 rounded-md text-sm font-medium ${
                      orderSide === 'sell'
                        ? 'bg-danger-100 text-danger-800 border border-danger-300'
                        : 'bg-gray-100 text-gray-700 border border-gray-300'
                    }`}
                  >
                    <TrendingDown className="h-4 w-4 inline mr-1" />
                    Sell
                  </button>
                </div>
              </div>

              {/* Size */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Size (Lots)</label>
                <input
                  type="number"
                  value={orderSize}
                  onChange={(e) => setOrderSize(parseFloat(e.target.value) || 0)}
                  step="0.01"
                  min="0.01"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Price (for limit orders) */}
              {orderType === 'limit' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Price</label>
                  <input
                    type="number"
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(e.target.value)}
                    step="0.0001"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              )}

              {/* Stop Loss */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stop Loss</label>
                <input
                  type="number"
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  step="0.0001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {/* Take Profit */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Take Profit</label>
                <input
                  type="number"
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  step="0.0001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div className="mt-6 flex space-x-3">
              <button
                onClick={handlePlaceOrder}
                className="btn-primary px-6 py-2"
              >
                Place Order
              </button>
              <button
                onClick={handleCloseAllPositions}
                className="btn-danger px-6 py-2"
              >
                Close All Positions
              </button>
            </div>
          </div>
        </div>

        {/* Account Summary */}
        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Account Summary</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Equity</span>
                <span className="font-medium">${state.balance.equity.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Balance</span>
                <span className="font-medium">${state.balance.balance.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Margin</span>
                <span className="font-medium">${state.balance.margin.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Free Margin</span>
                <span className="font-medium">${state.balance.freeMargin.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Margin Level</span>
                <span className="font-medium">{state.balance.marginLevel.toFixed(2)}%</span>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Total Trades</span>
                <span className="font-medium">{state.metrics.totalTrades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Win Rate</span>
                <span className="font-medium">{(state.metrics.winRate * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Profit Factor</span>
                <span className="font-medium">{state.metrics.profitFactor.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Sharpe Ratio</span>
                <span className="font-medium">{state.metrics.sharpeRatio.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Positions */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Open Positions</h3>
          <span className="text-sm text-gray-600">{state.positions.length} positions</span>
        </div>
        
        {state.positions.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Activity className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No open positions</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Side</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entry Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P&L</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">P&L %</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {state.positions.map((position) => {
                  const SideIcon = getSideIcon(position.side)
                  return (
                    <tr key={position.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {position.symbol}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className={`flex items-center ${getSideColor(position.side)}`}>
                          <SideIcon className="h-4 w-4 mr-1" />
                          {position.side.toUpperCase()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {position.size}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {position.entryPrice.toFixed(4)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {position.currentPrice.toFixed(4)}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getPnLColor(position.pnl)}`}>
                        {position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(2)}
                      </td>
                      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${getPnLColor(position.pnlPercent)}`}>
                        {position.pnlPercent >= 0 ? '+' : ''}{position.pnlPercent.toFixed(2)}%
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          onClick={() => handleClosePosition(position.id)}
                          className="text-danger-600 hover:text-danger-900 font-medium"
                        >
                          Close
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Orders */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Pending Orders</h3>
          <span className="text-sm text-gray-600">{state.orders.length} orders</span>
        </div>
        
        {state.orders.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Settings className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>No pending orders</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Symbol</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Side</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Size</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {state.orders.map((order) => (
                  <tr key={order.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {order.symbol}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.type.toUpperCase()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className={`flex items-center ${getSideColor(order.side)}`}>
                        {order.side === 'buy' ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />}
                        {order.side.toUpperCase()}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.size}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {order.price ? order.price.toFixed(4) : 'Market'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        order.status === 'filled' 
                          ? 'bg-success-100 text-success-800'
                          : order.status === 'cancelled'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {order.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {order.status === 'pending' && (
                        <button className="text-danger-600 hover:text-danger-900 font-medium">
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}