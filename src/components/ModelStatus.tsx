import React from 'react'
import { Brain, Activity, Clock, AlertCircle } from 'lucide-react'

interface ModelStatusProps {
  models: Array<{
    name: string
    type: 'rf' | 'lstm' | 'ddqn'
    status: 'active' | 'training' | 'offline'
    accuracy: number
    lastUpdate: string
    version: string
  }>
}

export default function ModelStatus({ models }: ModelStatusProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <Activity className="h-4 w-4 text-success-500" />
      case 'training':
        return <Clock className="h-4 w-4 text-yellow-500" />
      case 'offline':
        return <AlertCircle className="h-4 w-4 text-danger-500" />
      default:
        return <Brain className="h-4 w-4 text-gray-500" />
    }
  }

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

  return (
    <div className="space-y-4">
      {models.map((model, index) => (
        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white rounded-lg">
              <Brain className="h-5 w-5 text-primary-600" />
            </div>
            <div>
              <h4 className="font-medium text-gray-900">{model.name}</h4>
              <p className="text-sm text-gray-600">
                Accuracy: {(model.accuracy * 100).toFixed(1)}% • v{model.version}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {getStatusIcon(model.status)}
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(model.status)}`}>
              {model.status.charAt(0).toUpperCase() + model.status.slice(1)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}