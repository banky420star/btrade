# SB1 ALPHA - Hybrid Trading Stack

A focused, production-ready trading system combining supervised ML (XGBoost) and reinforcement learning (DDQN) with robust data integrity and parallel live+training capabilities.

## 🚀 Quick Start

### 1. Setup (One-time)

```bash
# Clone the repository
git clone <repository-url>
cd sb1-alpha

# Run automated setup
python setup.py

# Or manual setup:
# python -m venv venv
# source venv/bin/activate  # On Windows: venv\Scripts\activate
# pip install -r requirements.txt
# cd apps/api && npm install
```

### 2. Test the System

```bash
# Run comprehensive tests
python test_system.py

# Run interactive demo
python demo.py
```

### 3. Start Trading

```bash
# Paper trading (recommended for testing)
python -m core.strategies.ml_runner --symbol XAUUSD --timeframe 1h --broker paper

# Live trading with Bybit
BROKER=bybit python -m core.strategies.ml_runner --symbol XAUUSD --timeframe 1h

# Parallel training + trading
./scripts/train_and_trade.sh
```

## 📊 Features

### Core Trading
- **Fast ML Training**: XGBoost with hist tree method, rolling walk-forward validation
- **RL Integration**: DDQN with prioritized replay, deterministic seeds
- **Parallel Live+Train**: Continuous model retraining while trading
- **Risk Management**: Kelly criterion, max drawdown protection, position sizing

### Data Integrity
- **Validation**: Checksums, data consistency checks, no look-ahead bias
- **Monitoring**: Real-time data quality alerts, performance degradation detection
- **Backup**: Atomic model swaps, rollback capability, audit logging

### Brokers
- **Paper**: In-memory simulation with realistic fills
- **Bybit**: REST + WebSocket integration
- **MT5**: Bridge server for Exness/MT5 execution

### Monitoring
- **Telegram Alerts**: Trade notifications, model switches, errors
- **API Endpoints**: Health checks, trade history, system status
- **Logging**: Structured logs with rotation, trade audit trail

## 🏗️ Architecture

```
sb1-alpha/
├── core/                    # Python: strategies, ML, RL, risk, backtests
│   ├── ml/                  # XGBoost + calibration pipeline
│   ├── rl/                  # DDQN with prioritized replay
│   ├── strategies/          # ML/RL/EMA strategy runners
│   ├── risk/                # Position sizing, drawdown protection
│   ├── data/                # Data loaders and validation
│   ├── backtest/            # Unified backtesting engine
│   └── util/                # Config, logging, broker interface
├── adapters/                # Broker implementations
│   ├── paper/               # In-memory paper trading
│   ├── bybit/               # Bybit REST + WebSocket
│   └── mt5_bridge/          # MT5 bridge server + EA
├── apps/api/                # Node/Express TypeScript API
├── scripts/                 # Development and deployment scripts
├── configs/                 # ML/RL configuration files
└── sample/                  # Sample data and examples
```

## ⚙️ Configuration

All configuration via environment variables. See `.env.example` for options.

### Key Settings
- `BROKER`: paper|bybit|mt5
- `SYMBOL`: Trading symbol (XAUUSD, EURUSD, etc.)
- `RISK_PER_TRADE`: Risk per trade (0.01 = 1%)
- `MAX_DRAWDOWN_PCT`: Max drawdown threshold (0.2 = 20%)

## 🧪 Testing

### Run All Tests
```bash
python test_system.py
```

### Individual Component Tests
```bash
# Test ML pipeline
python -m core.ml.train --symbol XAUUSD --timeframe 1h --start-date 2024-01-01 --end-date 2024-01-31

# Test backtesting
python -m core.backtest.engine --strategy ema --fast 5 --slow 20

# Test paper trading
python -c "from core.adapters.paper.broker import PaperBroker; broker = PaperBroker(); print('Paper broker working!')"
```

## 📈 Backtesting

### EMA Strategy
```bash
python -m core.backtest.engine --strategy ema --fast 5 --slow 20 --data-file sample/XAUUSD_1h.csv
```

### ML Strategy
```bash
python -m core.backtest.engine --strategy ml --model-path models/registry/xgb_latest.joblib --data-file sample/XAUUSD_1h.csv
```

### RL Strategy
```bash
python -m core.backtest.engine --strategy rl --model-path models/registry/ddqn_weights.h5 --data-file sample/XAUUSD_1h.csv
```

## 🔄 Live Trading

### Paper Trading
```bash
python -m core.strategies.ml_runner --symbol XAUUSD --timeframe 1h --broker paper
```

### Bybit Live Trading
```bash
# Set your API keys in .env
BROKER=bybit python -m core.strategies.ml_runner --symbol XAUUSD --timeframe 1h
```

### MT5 Bridge
```bash
# Start bridge server
python core/adapters/mt5_bridge/bridge_server.py

# In MT5, load EA/sb1_bridge.mq5
# Configure bridge connection in EA settings
```

## 🌐 API Server

### Start API Server
```bash
cd apps/api
npm run dev
```

### API Endpoints
- **Health**: `GET http://localhost:3001/health`
- **Trades**: `GET http://localhost:3001/trades`
- **Signals**: `GET http://localhost:3001/signals`
- **WebSocket**: `ws://localhost:3001`

## 📊 Monitoring

### Telegram Alerts
Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env` for real-time alerts.

### Logs
- **System Logs**: `logs/sb1_alpha.log`
- **Trade Logs**: `logs/trades.csv`
- **API Logs**: `logs/api-combined.log`

### Performance Metrics
- Sharpe Ratio
- Maximum Drawdown
- Win Rate
- Profit Factor
- Calmar Ratio

## 🛡️ Risk Management

- **Position Sizing**: Kelly criterion with max 2% per trade
- **Drawdown Protection**: Automatic stop at configured threshold
- **Model Validation**: Out-of-sample performance checks before deployment
- **Emergency Stop**: Immediate halt via API or Telegram command

## 🔧 Development

### Training Models
```bash
# Train ML model
python -m core.ml.train --symbol XAUUSD --timeframe 1h --start-date 2024-01-01 --end-date 2024-01-31

# Train RL model
python -m core.rl.train_rl --symbol XAUUSD --timeframe 1h --start-date 2024-01-01 --end-date 2024-01-31

# Parallel training + trading
./scripts/train_and_trade.sh
```

### Model Validation
```bash
python -m core.ml.validate_models --symbol XAUUSD --timeframe 1h
```

## 🚨 Troubleshooting

### Common Issues

1. **Import Errors**
   ```bash
   # Ensure you're in the project root
   cd sb1-alpha
   python -c "import sys; sys.path.insert(0, '.'); from core.util.config import get_config"
   ```

2. **Data Issues**
   ```bash
   # Create sample data
   python demo.py
   ```

3. **Model Training Fails**
   ```bash
   # Check data integrity
   python test_system.py
   ```

4. **API Server Issues**
   ```bash
   # Install Node.js dependencies
   cd apps/api && npm install
   ```

### Debug Mode
```bash
LOG_LEVEL=DEBUG python -m core.strategies.ml_runner
```

## 📚 Documentation

- **API Documentation**: `docs/api.md`
- **Model Architecture**: `docs/models.md`
- **Risk Management**: `docs/risk.md`
- **Deployment Guide**: `docs/deployment.md`

## ⚠️ Disclaimer

This software is for educational and research purposes. Trading involves substantial risk of loss. Past performance does not guarantee future results. Use at your own risk.

## 📄 License

MIT License - see LICENSE file for details.

## Features

### Core Trading
- **Fast ML Training**: XGBoost with hist tree method, rolling walk-forward validation
- **RL Integration**: DDQN with prioritized replay, deterministic seeds
- **Parallel Live+Train**: Continuous model retraining while trading
- **Risk Management**: Kelly criterion, max drawdown protection, position sizing

### Data Integrity
- **Validation**: Checksums, data consistency checks, no look-ahead bias
- **Monitoring**: Real-time data quality alerts, performance degradation detection
- **Backup**: Atomic model swaps, rollback capability, audit logging

### Brokers
- **Paper**: In-memory simulation with realistic fills
- **Bybit**: REST + WebSocket integration
- **MT5**: Bridge server for Exness/MT5 execution

### Monitoring
- **Telegram Alerts**: Trade notifications, model switches, errors
- **API Endpoints**: Health checks, trade history, system status
- **Logging**: Structured logs with rotation, trade audit trail

## Configuration

All configuration via environment variables. See `.env.example` for options.

### Key Settings
- `BROKER`: paper|bybit|mt5
- `SYMBOL`: Trading symbol (XAUUSD, EURUSD, etc.)
- `RISK_PER_TRADE`: Risk per trade (0.01 = 1%)
- `MAX_DRAWDOWN_PCT`: Max drawdown threshold (0.2 = 20%)

## Development

### Training Models
```bash
# Train ML model
python -m core.ml.train --symbol XAUUSD --timeframe 1h

# Train RL model
python -m core.rl.train_rl --symbol XAUUSD --epochs 10

# Parallel training + trading
./scripts/train_and_trade.sh
```

### Backtesting
```bash
# ML strategy
python -m core.backtest.engine --strategy ml --model models/registry/xgb_latest.joblib

# RL strategy  
python -m core.backtest.engine --strategy rl --policy models/registry/ddqn_weights.h5

# EMA strategy
python -m core.backtest.engine --strategy ema --fast 5 --slow 20
```

### API Server
```bash
cd apps/api
npm run dev
# Health: http://localhost:3001/health
# Trades: http://localhost:3001/trades
```

## Risk Management

- **Position Sizing**: Kelly criterion with max 2% per trade
- **Drawdown Protection**: Automatic stop at configured threshold
- **Model Validation**: Out-of-sample performance checks before deployment
- **Emergency Stop**: Immediate halt via API or Telegram command

## Data Sources

- **Primary**: Bybit WebSocket for real-time data
- **Backup**: CCXT for historical data
- **Validation**: Cross-reference multiple sources for data integrity

## Deployment

### Production Checklist
- [ ] Environment variables configured
- [ ] API keys secured
- [ ] Telegram bot configured
- [ ] Log rotation enabled
- [ ] Model validation passing
- [ ] Risk limits set
- [ ] Monitoring alerts active

### Monitoring
- Check `/health` endpoint for system status
- Monitor `logs/sb1_alpha.log` for errors
- Telegram alerts for critical events
- Model performance tracking in `reports/`

## Troubleshooting

### Common Issues
1. **Model not loading**: Check `models/registry/` directory
2. **Data connection**: Verify Bybit keys and network
3. **MT5 bridge**: Ensure EA is loaded and connected
4. **Telegram alerts**: Check bot token and chat ID

### Debug Mode
```bash
LOG_LEVEL=DEBUG python -m core.strategies.ml_runner
```

## License

MIT License - see LICENSE file for details.

## Disclaimer

This software is for educational and research purposes. Trading involves substantial risk of loss. Past performance does not guarantee future results. Use at your own risk.