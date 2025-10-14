#!/usr/bin/env python3
"""
SB1 ALPHA Demo Script - Complete Working Example
"""
import os
import sys
import time
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from core.util.config import get_config
from core.util.logger import get_logger
from core.data.loaders import DataLoader
from core.ml.featureset import FeatureSet
from core.ml.labeler import Labeler
from core.ml.xgb_model import XGBModel
from core.ml.train import MLTrainer
from core.backtest.engine import BacktestEngine
from core.adapters.paper.broker import PaperBroker

logger = get_logger(__name__)

def create_sample_data():
    """Create sample data for demonstration."""
    print("📊 Creating sample data...")
    
    # Generate sample OHLCV data
    np.random.seed(42)
    dates = pd.date_range(start='2024-01-01', end='2024-01-31', freq='1H')
    n = len(dates)
    
    # Generate realistic price data
    base_price = 2000.0
    returns = np.random.normal(0, 0.001, n)
    prices = [base_price]
    
    for ret in returns[1:]:
        prices.append(prices[-1] * (1 + ret))
    
    # Create OHLCV data
    data = []
    for i, (date, price) in enumerate(zip(dates, prices)):
        # Generate realistic OHLC from close price
        volatility = 0.0005
        high = price * (1 + np.random.uniform(0, volatility))
        low = price * (1 - np.random.uniform(0, volatility))
        open_price = prices[i-1] if i > 0 else price
        volume = np.random.uniform(1000, 5000)
        
        data.append({
            'timestamp': date,
            'open': open_price,
            'high': high,
            'low': low,
            'close': price,
            'volume': volume
        })
    
    df = pd.DataFrame(data)
    df.set_index('timestamp', inplace=True)
    
    # Save sample data
    sample_file = project_root / 'sample' / 'XAUUSD_1h.csv'
    sample_file.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(sample_file)
    
    print(f"✅ Sample data created: {len(df)} bars saved to {sample_file}")
    return df

def demo_ml_training():
    """Demonstrate ML training pipeline."""
    print("\n🧠 Starting ML Training Demo...")
    
    # Create sample data
    df = create_sample_data()
    
    # Initialize components
    feature_set = FeatureSet()
    labeler = Labeler(horizon=3, threshold=0.001)
    
    # Prepare features and labels
    print("📈 Preparing features and labels...")
    features_df = feature_set.calculate_technical_indicators(df)
    labels = labeler.create_labels(features_df)
    
    # Prepare feature matrix
    X, y = feature_set.prepare_features(features_df, target_col='close')
    
    print(f"✅ Features prepared: {X.shape[1]} features, {X.shape[0]} samples")
    
    # Train XGBoost model
    print("🤖 Training XGBoost model...")
    model = XGBModel()
    train_metrics = model.train(X, y, calibrate=True)
    
    print(f"✅ Model trained successfully!")
    print(f"   - Training Accuracy: {train_metrics['train_metrics']['accuracy']:.3f}")
    print(f"   - Validation Accuracy: {train_metrics['val_metrics']['accuracy']:.3f}")
    
    # Save model
    model_path = project_root / 'models' / 'registry' / 'xgb_demo.joblib'
    model_path.parent.mkdir(parents=True, exist_ok=True)
    model.save_model(str(model_path))
    
    print(f"💾 Model saved to: {model_path}")
    
    return str(model_path)

def demo_backtesting():
    """Demonstrate backtesting engine."""
    print("\n📊 Starting Backtesting Demo...")
    
    # Load sample data
    sample_file = project_root / 'sample' / 'XAUUSD_1h.csv'
    df = pd.read_csv(sample_file, index_col=0, parse_dates=True)
    
    # Initialize backtest engine
    engine = BacktestEngine()
    
    # Test EMA strategy
    print("📈 Testing EMA strategy...")
    ema_results = engine.run_backtest(
        strategy='ema',
        data=df,
        strategy_params={
            'fast': 5,
            'slow': 20,
            'initial_capital': 10000,
            'risk_per_trade': 0.01
        }
    )
    
    print(f"✅ EMA Backtest completed!")
    print(f"   - Total Return: {ema_results['performance_metrics']['total_return']:.2%}")
    print(f"   - Sharpe Ratio: {ema_results['performance_metrics']['sharpe_ratio']:.3f}")
    print(f"   - Max Drawdown: {ema_results['performance_metrics']['max_drawdown']:.2%}")
    print(f"   - Total Trades: {ema_results['performance_metrics']['total_trades']}")
    
    # Test ML strategy
    print("\n🤖 Testing ML strategy...")
    model_path = project_root / 'models' / 'registry' / 'xgb_demo.joblib'
    
    if model_path.exists():
        ml_results = engine.run_backtest(
            strategy='ml',
            data=df,
            strategy_params={
                'model_path': str(model_path),
                'confidence_threshold': 0.6,
                'initial_capital': 10000,
                'risk_per_trade': 0.01
            }
        )
        
        print(f"✅ ML Backtest completed!")
        print(f"   - Total Return: {ml_results['performance_metrics']['total_return']:.2%}")
        print(f"   - Sharpe Ratio: {ml_results['performance_metrics']['sharpe_ratio']:.3f}")
        print(f"   - Max Drawdown: {ml_results['performance_metrics']['max_drawdown']:.2%}")
        print(f"   - Total Trades: {ml_results['performance_metrics']['total_trades']}")
    
    return ema_results

def demo_paper_trading():
    """Demonstrate paper trading."""
    print("\n💰 Starting Paper Trading Demo...")
    
    # Initialize paper broker
    broker = PaperBroker()
    broker.set_initial_balance(10000.0)
    
    print(f"🏦 Paper broker initialized with ${broker.get_balance()['total_value']:.2f}")
    
    # Simulate some trades
    trades = [
        {'symbol': 'XAUUSD', 'side': 'buy', 'size': 0.1, 'price': 2000.0},
        {'symbol': 'XAUUSD', 'side': 'buy', 'size': 0.05, 'price': 2005.0},
        {'symbol': 'XAUUSD', 'side': 'sell', 'size': 0.1, 'price': 2010.0},
        {'symbol': 'XAUUSD', 'side': 'sell', 'size': 0.05, 'price': 2015.0},
    ]
    
    print("📈 Executing sample trades...")
    for i, trade in enumerate(trades, 1):
        result = broker.place_order(**trade)
        if result['success']:
            print(f"   Trade {i}: {trade['side'].upper()} {trade['size']} {trade['symbol']} at {trade['price']} ✅")
        else:
            print(f"   Trade {i}: Failed - {result['error']} ❌")
    
    # Get final balance
    balance = broker.get_balance()
    print(f"\n💰 Final Balance: ${balance['total_value']:.2f}")
    print(f"   - Cash: ${balance['cash']:.2f}")
    print(f"   - Unrealized P&L: ${balance['unrealized_pnl']:.2f}")
    
    # Get performance metrics
    metrics = broker.get_performance_metrics()
    print(f"📊 Performance Metrics:")
    print(f"   - Total Trades: {metrics['total_trades']}")
    print(f"   - Win Rate: {metrics['win_rate']:.2%}")
    print(f"   - Total P&L: ${metrics['total_pnl']:.2f}")
    print(f"   - Sharpe Ratio: {metrics['sharpe_ratio']:.3f}")
    
    return broker

def demo_api_server():
    """Demonstrate API server."""
    print("\n🌐 Starting API Server Demo...")
    
    # Check if API dependencies are installed
    try:
        import express
        print("✅ Express.js dependencies available")
    except ImportError:
        print("⚠️  Express.js dependencies not installed. Run: cd apps/api && npm install")
        return
    
    print("🚀 API Server would start here...")
    print("   - Health endpoint: http://localhost:3001/health")
    print("   - Trades endpoint: http://localhost:3001/trades")
    print("   - Signals endpoint: http://localhost:3001/signals")
    print("   - WebSocket: ws://localhost:3001")

def main():
    """Main demo function."""
    print("🚀 SB1 ALPHA - Complete Trading System Demo")
    print("=" * 50)
    
    try:
        # Demo 1: ML Training
        model_path = demo_ml_training()
        
        # Demo 2: Backtesting
        backtest_results = demo_backtesting()
        
        # Demo 3: Paper Trading
        broker = demo_paper_trading()
        
        # Demo 4: API Server
        demo_api_server()
        
        print("\n" + "=" * 50)
        print("🎉 SB1 ALPHA Demo Completed Successfully!")
        print("\n📋 Next Steps:")
        print("1. Run: cd apps/api && npm install && npm run dev")
        print("2. Run: python -m core.ml.train --symbol XAUUSD --timeframe 1h --start-date 2024-01-01 --end-date 2024-01-31")
        print("3. Run: python -m core.backtest.engine --strategy ml --model-path models/registry/xgb_demo.joblib")
        print("4. Run: ./scripts/train_and_trade.sh")
        print("\n🔗 Documentation: README.md")
        print("⚙️  Configuration: .env.example")
        
    except Exception as e:
        print(f"\n❌ Demo failed: {e}")
        import traceback
        traceback.print_exc()
        return 1
    
    return 0

if __name__ == "__main__":
    exit(main())