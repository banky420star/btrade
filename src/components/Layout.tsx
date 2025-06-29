import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { 
  BarChart3, 
  Brain, 
  Shield, 
  TrendingUp, 
  Settings, 
  Bell,
  Menu,
  X,
  Power,
  AlertTriangle
} from 'lucide-react'
import { useTradingContext } from '../contexts/TradingContext'
import StatusIndicator from './StatusIndicator'
import AlertPanel from './AlertPanel'

interface LayoutProps {
  children: React.ReactNode
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: BarChart3 },
  { name: 'Trading', href: '/trading', icon: TrendingUp },
  { name: 'Models', href: '/models', icon: Brain },
  { name: 'Risk', href: '/risk', icon: Shield },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const location = useLocation()
  const { state, toggleTradingMode, emergencyStop } = useTradingContext()

  const unreadAlerts = state.alerts.filter(alert => !alert.read).length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar */}
      <div className={`fixed inset-0 z-50 lg:hidden ${sidebarOpen ? 'block' : 'hidden'}`}>
        <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={() => setSidebarOpen(false)} />
        <div className="fixed inset-y-0 left-0 flex w-64 flex-col bg-white shadow-xl">
          <div className="flex h-16 items-center justify-between px-4">
            <h1 className="text-xl font-bold text-gray-900">AlgoTrader Pro</h1>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                    isActive
                      ? 'bg-primary-100 text-primary-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
          <div className="flex items-center h-16 px-4 border-b border-gray-200">
            <h1 className="text-xl font-bold text-gray-900">AlgoTrader Pro</h1>
          </div>
          <nav className="flex-1 space-y-1 px-2 py-4">
            {navigation.map((item) => {
              const Icon = item.icon
              const isActive = location.pathname === item.href
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`group flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                    isActive
                      ? 'bg-primary-100 text-primary-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              )
            })}
          </nav>
          
          {/* System Status */}
          <div className="p-4 border-t border-gray-200">
            <StatusIndicator />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-40 bg-white shadow-sm border-b border-gray-200">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-500 hover:text-gray-600 lg:hidden"
            >
              <Menu className="h-6 w-6" />
            </button>

            <div className="flex items-center space-x-4">
              {/* Trading Mode Toggle */}
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Mode:</span>
                <button
                  onClick={toggleTradingMode}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    state.tradingMode === 'live'
                      ? 'bg-danger-100 text-danger-800'
                      : 'bg-success-100 text-success-800'
                  }`}
                >
                  {state.tradingMode.toUpperCase()}
                </button>
              </div>

              {/* Emergency Stop */}
              <button
                onClick={emergencyStop}
                className="btn-danger px-3 py-1 text-xs"
              >
                <AlertTriangle className="h-4 w-4 mr-1" />
                Emergency Stop
              </button>

              {/* Alerts */}
              <button
                onClick={() => setAlertsOpen(!alertsOpen)}
                className="relative p-2 text-gray-400 hover:text-gray-600"
              >
                <Bell className="h-6 w-6" />
                {unreadAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-danger-500 text-white text-xs flex items-center justify-center">
                    {unreadAlerts > 9 ? '9+' : unreadAlerts}
                  </span>
                )}
              </button>

              {/* Connection Status */}
              <div className="flex items-center space-x-2">
                <div className={`pulse-dot ${state.isConnected ? 'success' : 'error'}`} />
                <span className="text-sm text-gray-600">
                  {state.isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>

      {/* Alert Panel */}
      <AlertPanel isOpen={alertsOpen} onClose={() => setAlertsOpen(false)} />
    </div>
  )
}