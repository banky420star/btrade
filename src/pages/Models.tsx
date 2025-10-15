import React, { useState, useEffect } from 'react'
import { useTradingContext } from '../contexts/TradingContext'
import { 
  Brain, 
  Play, 
  Pause, 
  RotateCcw, 
  Download, 
  Upload,
  BarChart3,
  TrendingUp,
  Activity,
  AlertCircle,
  CheckCircle,
  Clock,
  Settings
} from 'lucide-react'

export default function Models() {
  const { state, executeCommand } = useTradingContext()
  const [selectedModel, setSelectedModel] = useState('randomforest')
  const [trainingProgress, setTrainingProgress] = useState(0)
  const [isTraining, setIsTraining] = useState(false)

  const modelTypes = [
    { id: 'randomforest', name: 'Random Forest', description: 'Pattern recognition and classification' },
    { id: 'lstm', name: 'LSTM Forecaster', description: 'Time series forecasting' },
    { id: 'ddqn', name: 'DDQN Agent', description: 'Reinforcement learning policy' }
  ]

  const handleTrainModel = async (modelType) => {
    setIsTraining(true)
    setTrainingProgress(0)
    
    try {
      await executeCommand(`train model ${modelType}`)
      
      // Simulate training progress
      const interval = setInterval(() => {
        setTrainingProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval)
            setIsTraining(false)
            return 100
          }
          return prev + Math.random() * 10
        })
      }, 1000)
    } catch (error) {
      setIsTraining(false)
      setTrainingProgress(0)
    }
  }

  const handleRetrainAll = async () => {
    setIsTraining(true)
    setTrainingProgress(0)
    await executeCommand('retrain all models')
    setIsTraining(false)
    setTrainingProgress(100)
  }

  const handleDeployModel = async (modelType) => {
    await executeCommand(`deploy model ${modelType}`)
  }

  const handleRollbackModel = async (modelType) => {
    await executeCommand(`rollback model ${modelType}`)
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-5 w-5 text-success-500" />
      case 'training':
        return <Activity className="h-5 w-5 text-yellow-500 animate-pulse" />
      case 'offline':
        return <AlertCircle className="h-5 w-5 text-danger-500" />
      default:
        return <Clock className="h-5 w-5 text-gray-500" />
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'active':
        return 'bg-success-100 text-success-800'
      case 'training':
        return 'bg-yellow-100 text-yellow-800'
      case 'offline':
        return 'bg-danger-100 text-danger-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getPerformanceColor = (performance) => {
    if (performance >= 80) return 'text-success-600'
    if (performance >= 60) return 'text-yellow-600'
    return 'text-danger-600'
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Models</h1>
          <p className="text-gray-600">ML model management and performance monitoring</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => handleRetrainAll()}
            disabled={isTraining}
            className="btn-primary px-4 py-2 disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Retrain All
          </button>
        </div>
      </div>

      {/* Model Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {state.models.map((model) => (
          <div key={model.type} className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                {getStatusIcon(model.status)}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{model.name}</h3>
                  <p className="text-sm text-gray-600">{model.type}</p>
                </div>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(model.status)}`}>
                {model.status.toUpperCase()}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Accuracy</span>
                <span className="font-medium">{(model.accuracy * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Performance</span>
                <span className={`font-medium ${getPerformanceColor(model.performance)}`}>
                  {model.performance.toFixed(1)}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Version</span>
                <span className="font-medium">{model.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Last Update</span>
                <span className="text-sm text-gray-500">
                  {new Date(model.lastUpdate).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Training Progress */}
            {model.status === 'training' && (
              <div className="mt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Training Progress</span>
                  <span>{Math.round(trainingProgress)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${trainingProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-4 flex space-x-2">
              <button
                onClick={() => handleTrainModel(model.type)}
                disabled={isTraining || model.status === 'training'}
                className="flex-1 btn-secondary px-3 py-2 text-sm disabled:opacity-50"
              >
                <Play className="h-4 w-4 mr-1" />
                Train
              </button>
              <button
                onClick={() => handleDeployModel(model.type)}
                disabled={model.status === 'active'}
                className="flex-1 btn-primary px-3 py-2 text-sm disabled:opacity-50"
              >
                <Upload className="h-4 w-4 mr-1" />
                Deploy
              </button>
              <button
                onClick={() => handleRollbackModel(model.type)}
                className="btn-danger px-3 py-2 text-sm"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Model Performance Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Accuracy Trends */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Accuracy Trends</h3>
          <div className="h-64 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>Accuracy trend chart will be displayed here</p>
            </div>
          </div>
        </div>

        {/* Performance Comparison */}
        <div className="card p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Comparison</h3>
          <div className="space-y-4">
            {state.models.map((model) => (
              <div key={model.type} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Brain className="h-5 w-5 text-gray-400" />
                  <span className="font-medium">{model.name}</span>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Accuracy</div>
                    <div className="font-medium">{(model.accuracy * 100).toFixed(1)}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600">Performance</div>
                    <div className={`font-medium ${getPerformanceColor(model.performance)}`}>
                      {model.performance.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Model Configuration */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Model Configuration</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {modelTypes.map((modelType) => (
            <div key={modelType.id} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center space-x-3 mb-3">
                <Brain className="h-5 w-5 text-gray-400" />
                <div>
                  <h4 className="font-medium text-gray-900">{modelType.name}</h4>
                  <p className="text-sm text-gray-600">{modelType.description}</p>
                </div>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Status</span>
                  <span className={getStatusColor(state.models.find(m => m.type === modelType.id)?.status || 'offline')}>
                    {state.models.find(m => m.type === modelType.id)?.status?.toUpperCase() || 'OFFLINE'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Accuracy</span>
                  <span>{(state.models.find(m => m.type === modelType.id)?.accuracy || 0) * 100}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Training</span>
                  <span>{new Date().toLocaleDateString()}</span>
                </div>
              </div>
              
              <div className="mt-4 flex space-x-2">
                <button
                  onClick={() => setSelectedModel(modelType.id)}
                  className={`flex-1 px-3 py-2 text-sm rounded-md ${
                    selectedModel === modelType.id
                      ? 'bg-primary-100 text-primary-800 border border-primary-300'
                      : 'bg-gray-100 text-gray-700 border border-gray-300'
                  }`}
                >
                  Configure
                </button>
                <button
                  onClick={() => handleTrainModel(modelType.id)}
                  disabled={isTraining}
                  className="btn-primary px-3 py-2 text-sm disabled:opacity-50"
                >
                  <Play className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Training Logs */}
      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Training Logs</h3>
        <div className="bg-gray-50 rounded-lg p-4 h-48 overflow-y-auto">
          <div className="space-y-2 text-sm font-mono">
            <div className="text-gray-600">[2024-01-15 10:30:15] Starting Random Forest training...</div>
            <div className="text-gray-600">[2024-01-15 10:30:45] LSTM model training completed with 72.1% accuracy</div>
            <div className="text-gray-600">[2024-01-15 10:31:20] DDQN agent training in progress...</div>
            <div className="text-success-600">[2024-01-15 10:32:00] All models deployed successfully</div>
            <div className="text-gray-600">[2024-01-15 10:32:15] Model validation completed</div>
          </div>
        </div>
      </div>
    </div>
  )
}