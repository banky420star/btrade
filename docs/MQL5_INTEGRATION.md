# MQL5 Trading Dashboard Integration Guide

## Overview

This document provides comprehensive guidance for integrating MQL5 Quotes service widgets into the AlgoTrader Pro dashboard, creating a professional-grade financial trading interface.

## Components Implemented

### 1. Primary Market Analysis Section

#### Candlestick Chart Widget
- **Symbol**: EURUSD D1 timeframe
- **Dimensions**: 340px × 200px
- **Features**:
  - Interactive price action with zoom capability
  - Volume indicators overlay
  - Moving averages (20, 50, 200 EMA)
  - Real-time price updates
- **Container ID**: `mql5-chart-widget`

```javascript
new window.MQL5.widget.Chart({
  container_id: 'mql5-chart-widget',
  width: 340,
  height: 200,
  symbol: 'EURUSD',
  interval: 'D1',
  timezone: 'Etc/UTC',
  theme: 'light',
  style: '1',
  locale: 'en'
})
```

### 2. Currency Matrix Display

#### Major Pairs Grid
- **Dimensions**: 700px × 420px (responsive)
- **Currencies**: EUR, USD, JPY, GBP, AUD, CAD, CHF, NZD
- **Features**:
  - 8×8 matrix for cross-rate analysis
  - Heat map coloring based on % change
  - Hover tooltips with detailed statistics
  - Real-time cross-rate calculations
- **Container ID**: `mql5-matrix-widget`

```javascript
new window.MQL5.widget.CurrencyMatrix({
  container_id: 'mql5-matrix-widget',
  width: 700,
  height: 420,
  currencies: ['EUR', 'USD', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF', 'NZD'],
  theme: 'light',
  locale: 'en'
})
```

### 3. Live Trading Information

#### Ticker Banner
- **Symbols**: EURUSD, USDJPY, GBPUSD, XAUUSD, USDCAD, USDCHF, NZDUSD
- **Dimensions**: Full viewport width, 50px height
- **Features**:
  - Bid/Ask spread display
  - 24h change percentage
  - Trading volume indicator
  - Real-time price streaming
- **Container ID**: `mql5-ticker-widget`

```javascript
new window.MQL5.widget.Ticker({
  container_id: 'mql5-ticker-widget',
  symbols: ['EURUSD', 'USDJPY', 'GBPUSD', 'XAUUSD', 'USDCAD', 'USDCHF', 'NZDUSD'],
  theme: 'light',
  locale: 'en',
  width: '100%',
  height: 50
})
```

### 4. Trading Performance Metrics

#### Active Positions Panel
- **Features**:
  - Current open trades with entry prices
  - Running P&L calculation
  - Stop loss/Take profit levels
  - Position sizing information
  - Real-time updates

#### Performance Summary
- Total P&L tracking
- Win rate calculation
- Active position count
- Model performance metrics

### 5. Model Analytics

#### ML Model Status
- **Features**:
  - Training progress indicator
  - Accuracy metrics display
  - Last update timestamp
  - Performance benchmarks
  - Status indicators (Active/Training/Offline)

## Configuration Requirements

### Unique Container IDs
- `mql5-chart-widget` - Candlestick chart
- `mql5-ticker-widget` - Live ticker banner
- `mql5-matrix-widget` - Currency strength matrix

### Responsive Layout
- Mobile-first design approach
- Breakpoint adaptations for tablets and mobile
- Flexible grid system
- Overflow handling for smaller screens

### Data Refresh Rate
- **Primary Rate**: 1-second updates
- **Fallback Rate**: 5-second retry on errors
- **Rate Limiting**: 10 requests/second, 600/minute

### Error Handling
- Graceful fallback display
- Retry mechanism with exponential backoff
- Error logging to local storage
- User-friendly error messages

### Cross-browser Compatibility
- Modern browser support (Chrome, Firefox, Safari, Edge)
- Polyfills for older browsers
- Progressive enhancement approach

### Local Storage Integration
- User preferences persistence
- Widget configuration caching
- Error log storage
- Performance optimization

## API Configuration

### Rate Limiting Parameters
```javascript
rateLimiting: {
  requestsPerSecond: 10,
  requestsPerMinute: 600,
  requestsPerHour: 36000
}
```

### Authentication (Optional)
```javascript
auth: {
  apiKey: process.env.MQL5_API_KEY || '',
  secretKey: process.env.MQL5_SECRET_KEY || ''
}
```

### Error Handling Configuration
```javascript
errorHandling: {
  showErrors: true,
  logErrors: true,
  fallbackContent: true,
  retryOnError: true
}
```

## Performance Optimizations

### Script Loading
- Preload MQL5 widget script
- DNS prefetch for c.mql5.com
- Async script loading
- Error boundary implementation

### Caching Strategy
- Widget configuration caching
- User preference persistence
- Error log rotation (last 50 entries)

### Responsive Design
- CSS Grid for layout
- Flexible widget dimensions
- Mobile-optimized interactions
- Touch-friendly controls

## Usage Instructions

### 1. Basic Integration
```tsx
import MQL5Dashboard from '../components/MQL5Dashboard'

function Dashboard() {
  return (
    <div>
      <MQL5Dashboard />
    </div>
  )
}
```

### 2. Custom Configuration
```javascript
// Modify mql5-config.js for custom settings
window.MQL5_CONFIG.chart.symbol = 'GBPUSD'
window.MQL5_CONFIG.ticker.symbols = ['EURUSD', 'GBPUSD']
```

### 3. Error Monitoring
```javascript
// Access error logs
const errors = window.MQL5_UTILS.loadPreferences()
console.log('Widget errors:', errors)
```

## Troubleshooting

### Common Issues

1. **Widget Not Loading**
   - Check internet connection
   - Verify MQL5 service availability
   - Check browser console for errors

2. **Rate Limiting**
   - Reduce update frequency
   - Implement request queuing
   - Monitor API usage

3. **Responsive Issues**
   - Check CSS media queries
   - Verify container dimensions
   - Test on multiple devices

### Debug Mode
Enable debug logging by setting:
```javascript
window.MQL5_CONFIG.errorHandling.logErrors = true
```

## Security Considerations

- API keys stored in environment variables
- HTTPS-only connections
- Input validation for user preferences
- XSS protection for dynamic content

## Browser Support

- **Minimum**: Chrome 70+, Firefox 65+, Safari 12+, Edge 79+
- **Recommended**: Latest stable versions
- **Mobile**: iOS Safari 12+, Chrome Mobile 70+

## Performance Metrics

- **Load Time**: <2 seconds for initial widgets
- **Update Latency**: <100ms for price updates
- **Memory Usage**: <50MB for all widgets
- **CPU Usage**: <5% during normal operation