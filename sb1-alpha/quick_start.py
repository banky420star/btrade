#!/usr/bin/env python3
"""
SB1 ALPHA Quick Start - Get Trading in 5 Minutes
"""
import os
import sys
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

def create_sample_data():
    """Create sample data for quick start."""
    print("📊 Creating sample data...")
    
    # Generate 7 days of hourly data
    dates = pd.date_range(start='2024-01-01', end='2024-01-08', freq='1H')
    n = len(dates)
    
    # Generate realistic price data with trend
    np.random.seed(42)
    base_price = 2000.0
    trend = np.linspace(0, 0.02, n)  # 2% upward trend
    noise = np.random.normal(0, 0.001, n)
    returns = trend + noise
    
    prices = [base_price]
    for ret in returns[1:]:
        prices.append(prices[-1] * (1 + ret))
    
    # Create OHLCV data
    data = []
    for i, (date, price) in enumerate(zip(dates, prices)):
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
    
    print(f"✅ Sample data created: {len(df)} bars")
    return df

def quick_ml_demo():
    """Quick ML demonstration."""
    print("\n🤖 Quick ML Demo...")
    
    try:
        from core.ml.featureset import FeatureSet
        from core.ml.labeler import Labeler
        from core.ml.xgb_model import XGBModel
        
        # Load sample data
        sample_file = project_root / 'sample' / 'XAUUSD_1h.csv'
        df = pd.read_csv(sample_file, index_col=0, parse_dates=True)
        
        # Prepare features
        feature_set = FeatureSet()
        features_df = feature_set.calculate_technical_indicators(df)
        
        # Create labels
        labeler = Labeler(horizon=3, threshold=0.001)
        labels = labeler.create_labels(features_df)
        
        # Prepare feature matrix
        X, y = feature_set.prepare_features(features_df, target_col='close')
        
        print(f"📈 Features: {X.shape[1]} features, {X.shape[0]} samples")
        
        # Train model
        model = XGBModel()
        train_metrics = model.train(X, y, calibrate=True)
        
        print(f"🎯 Model trained!")
        print(f"   - Accuracy: {train_metrics['train_metrics']['accuracy']:.3f}")
        print(f"   - Features: {len(model.get_feature_importance())}")
        
        # Save model
        model_path = project_root / 'models' / 'registry' / 'quick_start_model.joblib'
        model_path.parent.mkdir(parents=True, exist_ok=True)
        model.save_model(str(model_path))
        
        print(f"💾 Model saved: {model_path}")
        return str(model_path)
        
    except Exception as e:
        print(f"❌ ML demo failed: {e}")
        return None

def quick_backtest_demo():
    """Quick backtest demonstration."""
    print("\n📊 Quick Backtest Demo...")
    
    try:
        from core.backtest.engine import BacktestEngine
        
        # Load sample data
        sample_file = project_root / 'sample' / 'XAUUSD_1h.csv'
        df = pd.read_csv(sample_file, index_col=0, parse_dates=True)
        
        # Run EMA backtest
        engine = BacktestEngine()
        results = engine.run_backtest(
            strategy='ema',
            data=df,
            strategy_params={
                'fast': 5,
                'slow': 20,
                'initial_capital': 10000,
                'risk_per_trade': 0.01
            }
        )
        
        metrics = results['performance_metrics']
        print(f"📈 Backtest Results:")
        print(f"   - Total Return: {metrics['total_return']:.2%}")
        print(f"   - Sharpe Ratio: {metrics['sharpe_ratio']:.3f}")
        print(f"   - Max Drawdown: {metrics['max_drawdown']:.2%}")
        print(f"   - Total Trades: {metrics['total_trades']}")
        
        return results
        
    except Exception as e:
        print(f"❌ Backtest demo failed: {e}")
        return None

def quick_paper_trading_demo():
    """Quick paper trading demonstration."""
    print("\n💰 Quick Paper Trading Demo...")
    
    try:
        from core.adapters.paper.broker import PaperBroker
        
        # Initialize broker
        broker = PaperBroker()
        broker.set_initial_balance(10000.0)
        
        print(f"🏦 Initial Balance: ${broker.get_balance()['total_value']:.2f}")
        
        # Simulate some trades
        trades = [
            {'symbol': 'XAUUSD', 'side': 'buy', 'size': 0.1, 'price': 2000.0},
            {'symbol': 'XAUUSD', 'side': 'buy', 'size': 0.05, 'price': 2005.0},
            {'symbol': 'XAUUSD', 'side': 'sell', 'size': 0.1, 'price': 2010.0},
            {'symbol': 'XAUUSD', 'side': 'sell', 'size': 0.05, 'price': 2015.0},
        ]
        
        print("📈 Executing trades...")
        for i, trade in enumerate(trades, 1):
            result = broker.place_order(**trade)
            if result['success']:
                print(f"   Trade {i}: {trade['side'].upper()} {trade['size']} at {trade['price']} ✅")
            else:
                print(f"   Trade {i}: Failed ❌")
        
        # Final results
        balance = broker.get_balance()
        metrics = broker.get_performance_metrics()
        
        print(f"\n💰 Final Results:")
        print(f"   - Balance: ${balance['total_value']:.2f}")
        print(f"   - P&L: ${balance['unrealized_pnl']:.2f}")
        print(f"   - Trades: {metrics['total_trades']}")
        print(f"   - Win Rate: {metrics['win_rate']:.1%}")
        
        return broker
        
    except Exception as e:
        print(f"❌ Paper trading demo failed: {e}")
        return None

def main():
    """Main quick start function."""
    print("🚀 SB1 ALPHA Quick Start")
    print("=" * 40)
    print("Get trading in 5 minutes!")
    print()
    
    try:
        # Step 1: Create sample data
        df = create_sample_data()
        
        # Step 2: ML Demo
        model_path = quick_ml_demo()
        
        # Step 3: Backtest Demo
        backtest_results = quick_backtest_demo()
        
        # Step 4: Paper Trading Demo
        broker = quick_paper_trading_demo()
        
        print("\n" + "=" * 40)
        print("🎉 Quick Start Completed Successfully!")
        print()
        print("📋 What's Next:")
        print("1. Run: python test_system.py (comprehensive tests)")
        print("2. Run: python demo.py (full interactive demo)")
        print("3. Run: python -m core.strategies.ml_runner --symbol XAUUSD --timeframe 1h --broker paper")
        print("4. Run: cd apps/api && npm install && npm run dev (API server)")
        print()
        print("🔗 Full Documentation: README.md")
        print("⚙️  Configuration: .env.example")
        
        return 0
        
    except Exception as e:
        print(f"\n❌ Quick start failed: {e}")
        import traceback
        traceback.print_exc()
        return 1

if __name__ == "__main__":
    exit(main())