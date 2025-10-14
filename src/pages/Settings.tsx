import React, { useState } from 'react'
import { useTradingContext } from '../contexts/TradingContext'
import { 
  Settings as SettingsIcon, 
  Save, 
  RotateCcw, 
  Database,
  Shield,
  Brain,
  Activity,
  Bell,
  Globe,
  Key,
  Server,
  AlertTriangle,
  CheckCircle
} from 'lucide-react'

export default function Settings() {
  const { state, executeCommand } = useTradingContext()
  const [activeTab, setActiveTab] = useState('general')
  const [isSaving, setIsSaving] = useState(false)
  const [settings, setSettings] = useState({
    general: {
      systemName: 'AlgoTrader Pro',
      timezone: 'UTC',
      language: 'en',
      theme: 'light',
      autoStart: true,
      logLevel: 'info'
    },
    trading: {
      defaultSymbol: 'EUR/USD',
      defaultLotSize: 0.1,
      maxPositions: 10,
      tradingMode: 'paper',
      autoClose: true,
      weekendClose: true
    },
    risk: {
      maxPositionSize: 0.02,
      maxDailyLoss: 0.05,
      maxDrawdown: 0.15,
      stopLossATR: 2.0,
      takeProfitATR: 3.0,
      kellyFraction: 0.25
    },
    models: {
      autoRetrain: true,
      retrainInterval: 24,
      validationThreshold: 0.5,
      ensembleWeights: {
        randomforest: 0.4,
        lstm: 0.4,
        ddqn: 0.2
      }
    },
    brokers: {
      primary: 'mt5',
      mt5: {
        enabled: true,
        server: 'demo',
        login: '',
        password: '',
        port: 1883
      },
      binance: {
        enabled: false,
        apiKey: '',
        secretKey: '',
        testnet: true
      },
      ibkr: {
        enabled: false,
        host: '127.0.0.1',
        port: 7497,
        clientId: 1
      }
    },
    notifications: {
      email: {
        enabled: true,
        address: '',
        alerts: true,
        reports: true
      },
      telegram: {
        enabled: false,
        botToken: '',
        chatId: ''
      },
      webhook: {
        enabled: false,
        url: '',
        events: ['trade', 'alert', 'error']
      }
    },
    data: {
      primarySource: 'ccxt',
      updateInterval: 5,
      historyDays: 365,
      cacheEnabled: true,
      cacheSize: 1000
    }
  })

  const tabs = [
    { id: 'general', name: 'General', icon: SettingsIcon },
    { id: 'trading', name: 'Trading', icon: Activity },
    { id: 'risk', name: 'Risk', icon: Shield },
    { id: 'models', name: 'Models', icon: Brain },
    { id: 'brokers', name: 'Brokers', icon: Server },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'data', name: 'Data', icon: Database }
  ]

  const handleSettingChange = (category, key, value) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value
      }
    }))
  }

  const handleNestedSettingChange = (category, parentKey, key, value) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [parentKey]: {
          ...prev[category][parentKey],
          [key]: value
        }
      }
    }))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await executeCommand(`update settings ${JSON.stringify(settings)}`)
      // Simulate save delay
      setTimeout(() => {
        setIsSaving(false)
      }, 1000)
    } catch (error) {
      setIsSaving(false)
    }
  }

  const handleReset = () => {
    // Reset to default settings
    setSettings({
      general: {
        systemName: 'AlgoTrader Pro',
        timezone: 'UTC',
        language: 'en',
        theme: 'light',
        autoStart: true,
        logLevel: 'info'
      },
      trading: {
        defaultSymbol: 'EUR/USD',
        defaultLotSize: 0.1,
        maxPositions: 10,
        tradingMode: 'paper',
        autoClose: true,
        weekendClose: true
      },
      risk: {
        maxPositionSize: 0.02,
        maxDailyLoss: 0.05,
        maxDrawdown: 0.15,
        stopLossATR: 2.0,
        takeProfitATR: 3.0,
        kellyFraction: 0.25
      },
      models: {
        autoRetrain: true,
        retrainInterval: 24,
        validationThreshold: 0.5,
        ensembleWeights: {
          randomforest: 0.4,
          lstm: 0.4,
          ddqn: 0.2
        }
      },
      brokers: {
        primary: 'mt5',
        mt5: {
          enabled: true,
          server: 'demo',
          login: '',
          password: '',
          port: 1883
        },
        binance: {
          enabled: false,
          apiKey: '',
          secretKey: '',
          testnet: true
        },
        ibkr: {
          enabled: false,
          host: '127.0.0.1',
          port: 7497,
          clientId: 1
        }
      },
      notifications: {
        email: {
          enabled: true,
          address: '',
          alerts: true,
          reports: true
        },
        telegram: {
          enabled: false,
          botToken: '',
          chatId: ''
        },
        webhook: {
          enabled: false,
          url: '',
          events: ['trade', 'alert', 'error']
        }
      },
      data: {
        primarySource: 'ccxt',
        updateInterval: 5,
        historyDays: 365,
        cacheEnabled: true,
        cacheSize: 1000
      }
    })
  }

  const renderGeneralSettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">System Name</label>
        <input
          type="text"
          value={settings.general.systemName}
          onChange={(e) => handleSettingChange('general', 'systemName', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Timezone</label>
          <select
            value={settings.general.timezone}
            onChange={(e) => handleSettingChange('general', 'timezone', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="UTC">UTC</option>
            <option value="America/New_York">New York</option>
            <option value="Europe/London">London</option>
            <option value="Asia/Tokyo">Tokyo</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Language</label>
          <select
            value={settings.general.language}
            onChange={(e) => handleSettingChange('general', 'language', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="en">English</option>
            <option value="es">Spanish</option>
            <option value="fr">French</option>
            <option value="de">German</option>
          </select>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Theme</label>
          <select
            value={settings.general.theme}
            onChange={(e) => handleSettingChange('general', 'theme', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="auto">Auto</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Log Level</label>
          <select
            value={settings.general.logLevel}
            onChange={(e) => handleSettingChange('general', 'logLevel', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="autoStart"
            checked={settings.general.autoStart}
            onChange={(e) => handleSettingChange('general', 'autoStart', e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="autoStart" className="ml-2 text-sm text-gray-700">
            Auto-start trading on system startup
          </label>
        </div>
      </div>
    </div>
  )

  const renderTradingSettings = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Default Symbol</label>
          <select
            value={settings.trading.defaultSymbol}
            onChange={(e) => handleSettingChange('trading', 'defaultSymbol', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="EUR/USD">EUR/USD</option>
            <option value="GBP/USD">GBP/USD</option>
            <option value="USD/JPY">USD/JPY</option>
            <option value="AUD/USD">AUD/USD</option>
            <option value="USD/CAD">USD/CAD</option>
            <option value="USD/CHF">USD/CHF</option>
            <option value="NZD/USD">NZD/USD</option>
          </select>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Default Lot Size</label>
          <input
            type="number"
            value={settings.trading.defaultLotSize}
            onChange={(e) => handleSettingChange('trading', 'defaultLotSize', parseFloat(e.target.value))}
            step="0.01"
            min="0.01"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Max Positions</label>
          <input
            type="number"
            value={settings.trading.maxPositions}
            onChange={(e) => handleSettingChange('trading', 'maxPositions', parseInt(e.target.value))}
            min="1"
            max="50"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Trading Mode</label>
          <select
            value={settings.trading.tradingMode}
            onChange={(e) => handleSettingChange('trading', 'tradingMode', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="paper">Paper Trading</option>
            <option value="live">Live Trading</option>
          </select>
        </div>
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="autoClose"
            checked={settings.trading.autoClose}
            onChange={(e) => handleSettingChange('trading', 'autoClose', e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="autoClose" className="ml-2 text-sm text-gray-700">
            Auto-close positions at market close
          </label>
        </div>
        
        <div className="flex items-center">
          <input
            type="checkbox"
            id="weekendClose"
            checked={settings.trading.weekendClose}
            onChange={(e) => handleSettingChange('trading', 'weekendClose', e.target.checked)}
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
          />
          <label htmlFor="weekendClose" className="ml-2 text-sm text-gray-700">
            Close positions before weekend
          </label>
        </div>
      </div>
    </div>
  )

  const renderRiskSettings = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Max Position Size (%)</label>
          <input
            type="number"
            value={settings.risk.maxPositionSize * 100}
            onChange={(e) => handleSettingChange('risk', 'maxPositionSize', parseFloat(e.target.value) / 100)}
            step="0.1"
            min="0.1"
            max="10"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Max Daily Loss (%)</label>
          <input
            type="number"
            value={settings.risk.maxDailyLoss * 100}
            onChange={(e) => handleSettingChange('risk', 'maxDailyLoss', parseFloat(e.target.value) / 100)}
            step="0.1"
            min="0.1"
            max="20"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Max Drawdown (%)</label>
          <input
            type="number"
            value={settings.risk.maxDrawdown * 100}
            onChange={(e) => handleSettingChange('risk', 'maxDrawdown', parseFloat(e.target.value) / 100)}
            step="0.1"
            min="1"
            max="50"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Kelly Fraction</label>
          <input
            type="number"
            value={settings.risk.kellyFraction}
            onChange={(e) => handleSettingChange('risk', 'kellyFraction', parseFloat(e.target.value))}
            step="0.01"
            min="0.01"
            max="1"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Stop Loss (ATR Multiplier)</label>
          <input
            type="number"
            value={settings.risk.stopLossATR}
            onChange={(e) => handleSettingChange('risk', 'stopLossATR', parseFloat(e.target.value))}
            step="0.1"
            min="0.5"
            max="10"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Take Profit (ATR Multiplier)</label>
          <input
            type="number"
            value={settings.risk.takeProfitATR}
            onChange={(e) => handleSettingChange('risk', 'takeProfitATR', parseFloat(e.target.value))}
            step="0.1"
            min="0.5"
            max="20"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
      </div>
    </div>
  )

  const renderBrokerSettings = () => (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Primary Broker</label>
        <select
          value={settings.brokers.primary}
          onChange={(e) => handleSettingChange('brokers', 'primary', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="mt5">MetaTrader 5</option>
          <option value="binance">Binance</option>
          <option value="ibkr">Interactive Brokers</option>
        </select>
      </div>
      
      {/* MT5 Settings */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-medium text-gray-900">MetaTrader 5</h4>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="mt5Enabled"
              checked={settings.brokers.mt5.enabled}
              onChange={(e) => handleNestedSettingChange('brokers', 'mt5', 'enabled', e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="mt5Enabled" className="ml-2 text-sm text-gray-700">
              Enable
            </label>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Server</label>
            <input
              type="text"
              value={settings.brokers.mt5.server}
              onChange={(e) => handleNestedSettingChange('brokers', 'mt5', 'server', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Port</label>
            <input
              type="number"
              value={settings.brokers.mt5.port}
              onChange={(e) => handleNestedSettingChange('brokers', 'mt5', 'port', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Login</label>
            <input
              type="text"
              value={settings.brokers.mt5.login}
              onChange={(e) => handleNestedSettingChange('brokers', 'mt5', 'login', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
            <input
              type="password"
              value={settings.brokers.mt5.password}
              onChange={(e) => handleNestedSettingChange('brokers', 'mt5', 'password', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>
      
      {/* Binance Settings */}
      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-medium text-gray-900">Binance</h4>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="binanceEnabled"
              checked={settings.brokers.binance.enabled}
              onChange={(e) => handleNestedSettingChange('brokers', 'binance', 'enabled', e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="binanceEnabled" className="ml-2 text-sm text-gray-700">
              Enable
            </label>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">API Key</label>
            <input
              type="text"
              value={settings.brokers.binance.apiKey}
              onChange={(e) => handleNestedSettingChange('brokers', 'binance', 'apiKey', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Secret Key</label>
            <input
              type="password"
              value={settings.brokers.binance.secretKey}
              onChange={(e) => handleNestedSettingChange('brokers', 'binance', 'secretKey', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        
        <div className="mt-4">
          <div className="flex items-center">
            <input
              type="checkbox"
              id="binanceTestnet"
              checked={settings.brokers.binance.testnet}
              onChange={(e) => handleNestedSettingChange('brokers', 'binance', 'testnet', e.target.checked)}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
            <label htmlFor="binanceTestnet" className="ml-2 text-sm text-gray-700">
              Use Testnet
            </label>
          </div>
        </div>
      </div>
    </div>
  )

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralSettings()
      case 'trading':
        return renderTradingSettings()
      case 'risk':
        return renderRiskSettings()
      case 'brokers':
        return renderBrokerSettings()
      default:
        return (
          <div className="text-center py-8 text-gray-500">
            <SettingsIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <p>Settings for {activeTab} coming soon...</p>
          </div>
        )
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600">System configuration and user preferences</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={handleReset}
            className="btn-secondary px-4 py-2"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary px-4 py-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Settings Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon className="h-4 w-4 inline mr-2" />
                {tab.name}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Settings Content */}
      <div className="card p-6">
        {renderTabContent()}
      </div>
    </div>
  )
}