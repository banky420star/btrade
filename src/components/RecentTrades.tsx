import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// Mock data for demonstration
const mockTrades = [
  {
    id: '1',
    symbol: 'EURUSD',
    side: 'buy' as const,
    size: 0.1,
    entryPrice: 1.0850,
    exitPrice: 1.0875,
    pnl: 25.00,
    timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  },
  {
    id: '2',
    symbol: 'GBPUSD',
    side: 'sell' as const,
    size: 0.05,
    entryPrice: 1.2650,
    exitPrice: 1.2625,
    pnl: 12.50,
    timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString()
  },
  {
    id: '3',
    symbol: 'USDJPY',
    side: 'buy' as const,
    size: 0.08,
    entryPrice: 149.50,
    exitPrice: 149.25,
    pnl: -20.00,
    timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  }
]

export default function RecentTrades() {
  return (
    <div className="space-y-3">
      {mockTrades.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No recent trades
        </div>
      ) : (
        mockTrades.map((trade) => (
          <div key={trade.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-lg ${
                trade.side === 'buy' ? 'bg-success-100' : 'bg-danger-100'
              }`}>
                {trade.side === 'buy' ? (
                  <TrendingUp className="h-4 w-4 text-success-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-danger-600" />
                )}
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-medium text-gray-900">{trade.symbol}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    trade.side === 'buy' 
                      ? 'bg-success-100 text-success-800' 
                      : 'bg-danger-100 text-danger-800'
                  }`}>
                    {trade.side.toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  {trade.size} lots • {trade.entryPrice} → {trade.exitPrice}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-medium ${
                trade.pnl >= 0 ? 'text-success-600' : 'text-danger-600'
              }`}>
                {trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}
              </p>
              <p className="text-xs text-gray-500">
                {formatDistanceToNow(new Date(trade.timestamp), { addSuffix: true })}
              </p>
            </div>
          </div>
        ))
      )}
    </div>
  )
}