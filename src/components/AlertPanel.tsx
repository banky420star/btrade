import React from 'react'
import { X, AlertCircle, CheckCircle, Info, AlertTriangle } from 'lucide-react'
import { useTradingContext } from '../contexts/TradingContext'
import { formatDistanceToNow } from 'date-fns'

interface AlertPanelProps {
  isOpen: boolean
  onClose: () => void
}

export default function AlertPanel({ isOpen, onClose }: AlertPanelProps) {
  const { state, dispatch } = useTradingContext()

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-success-500" />
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-danger-500" />
      default:
        return <Info className="h-5 w-5 text-primary-500" />
    }
  }

  const markAsRead = (alertId: string) => {
    dispatch({ type: 'MARK_ALERT_READ', payload: alertId })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-25" onClick={onClose} />
      
      <div className="absolute right-0 top-0 h-full w-96 bg-white shadow-xl">
        <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Alerts</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {state.alerts.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              No alerts
            </div>
          ) : (
            <div className="space-y-1 p-4">
              {state.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    alert.read
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-white border-gray-300 shadow-sm'
                  }`}
                  onClick={() => markAsRead(alert.id)}
                >
                  <div className="flex items-start space-x-3">
                    {getAlertIcon(alert.type)}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${alert.read ? 'text-gray-600' : 'text-gray-900'}`}>
                        {alert.message}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}
                      </p>
                    </div>
                    {!alert.read && (
                      <div className="w-2 h-2 bg-primary-500 rounded-full" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}