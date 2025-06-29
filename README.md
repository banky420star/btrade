# AlgoTrader Pro - ML Trading System

A comprehensive algorithmic trading system with machine learning ensemble, risk management, and real-time monitoring.

## 🏗️ Architecture Overview

### Core Components

- **Data & Features**: CCXT fetchers + 60+ technical indicators across multiple timeframes
- **ML Models**: Random Forest + LSTM + DDQN ensemble for decision making
- **Trade Engine**: Multi-threaded orchestrator with broker abstraction
- **Risk Manager**: Kelly-capped sizing, ATR stops, drawdown protection
- **Model Manager**: Hot-swap capabilities with walk-forward validation
- **MT5 Bridge**: ZeroMQ integration for MetaTrader 5
- **Command Interface**: REST API, CLI, and Telegram bot with RBAC
- **Observability**: Prometheus metrics, Grafana dashboards, structured logging

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Docker & Docker Compose (for full stack)
- MetaTrader 5 (for live trading)

### Development Setup

1. **Clone and Install**
   ```bash
   git clone <repository>
   cd algo-trading-system
   npm install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Development Server**
   ```bash
   npm run dev        # Frontend (port 3000)
   npm start          # Backend (port 8000)
   ```

4. **Access Dashboard**
   - Frontend: http://localhost:3000
   - API: http://localhost:8000

### Production Deployment

```bash
# Build for production
npm run build

# Start with Docker Compose
docker-compose up -d
```

## 📊 Features

### Dashboard
- Real-time system status and metrics
- Equity curve visualization
- Model performance monitoring
- Recent trades and alerts

### Trading Engine
- Multi-timeframe analysis (1m → 1D)
- Ensemble ML decision making
- Risk-managed position sizing
- Real-time execution monitoring

### Risk Management
- Kelly criterion position sizing
- ATR-based stop losses
- Maximum drawdown protection
- Weekend position flattening

### Model Management
- Hot-swap model deployment
- Walk-forward validation
- Performance-based promotion
- Automatic rollback on failure

### Monitoring & Alerts
- Real-time system health
- Performance metrics tracking
- Configurable alert system
- Comprehensive logging

## 🔧 Configuration

### Trading Modes
- **Paper Mode**: Risk-free simulation
- **Live Mode**: Real money trading

### Model Configuration
- Random Forest: Pattern recognition
- LSTM: Sequence forecasting
- DDQN: Reinforcement learning policy

### Risk Parameters
- Maximum position size
- Stop loss levels
- Drawdown limits
- Correlation limits

## 🛡️ Safety Features

- **Emergency Stop**: Immediate halt of all trading
- **Circuit Breakers**: Automatic shutdown on excessive losses
- **Model Validation**: Continuous performance monitoring
- **Rollback Capability**: Instant reversion to previous models
- **Chaos Testing**: Automated resilience testing

## 📈 Performance Monitoring

### Key Metrics
- Sharpe Ratio
- Maximum Drawdown
- Win Rate
- Profit Factor
- Calmar Ratio

### Real-time Monitoring
- Position P&L
- Model accuracy
- System latency
- Connection status

## 🔌 Integrations

### Supported Brokers
- MetaTrader 5 (via ZeroMQ)
- Interactive Brokers (planned)
- Binance (planned)

### Data Sources
- CCXT for market data
- Custom feature engineering
- Alternative data integration

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run chaos tests
npm run test:chaos
```

## 📚 Documentation

- [API Documentation](docs/api.md)
- [Model Architecture](docs/models.md)
- [Risk Management](docs/risk.md)
- [Deployment Guide](docs/deployment.md)

## ⚠️ Disclaimer

This software is for educational and research purposes. Trading involves substantial risk of loss. Past performance does not guarantee future results. Use at your own risk.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.