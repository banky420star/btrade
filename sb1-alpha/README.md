# SB1 ALPHA - Hybrid Trading Stack

A focused, production-ready trading system combining supervised ML (XGBoost) and reinforcement learning (DDQN) with robust data integrity and parallel live+training capabilities.

## Architecture

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
└── scripts/                 # Development and deployment scripts
```

## Quick Start

### Mac (Paper/Bybit Mode)

```bash
# Clone and setup
git clone <repo>
cd sb1-alpha
cp .env.example .env
# Edit .env with your Bybit keys

# Install dependencies
pip install -r requirements.txt
cd apps/api && npm install

# Run paper trading
python -m core.strategies.ml_runner

# Run with Bybit (live)
BROKER=bybit python -m core.strategies.ml_runner
```

### Windows VPS (MT5 Mode)

```bash
# Setup Python environment
pip install -r requirements.txt

# Start MT5 bridge
python adapters/mt5_bridge/bridge_server.py

# In MT5, load EA/sb1_bridge.mq5
# Configure bridge connection in EA settings
```

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