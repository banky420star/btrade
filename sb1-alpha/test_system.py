#!/usr/bin/env python3
"""
SB1 ALPHA System Test Script
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

def test_imports():
    """Test all imports."""
    print("🧪 Testing imports...")
    
    try:
        from core.util.config import get_config
        print("✅ Config module imported")
        
        from core.util.logger import get_logger
        print("✅ Logger module imported")
        
        from core.data.loaders import DataLoader
        print("✅ DataLoader module imported")
        
        from core.ml.featureset import FeatureSet
        print("✅ FeatureSet module imported")
        
        from core.ml.labeler import Labeler
        print("✅ Labeler module imported")
        
        from core.ml.xgb_model import XGBModel
        print("✅ XGBModel module imported")
        
        from core.backtest.engine import BacktestEngine
        print("✅ BacktestEngine module imported")
        
        from core.adapters.paper.broker import PaperBroker
        print("✅ PaperBroker module imported")
        
        from core.risk.position_sizing import PositionSizer
        print("✅ PositionSizer module imported")
        
        from core.risk.max_drawdown_guard import MaxDrawdownGuard
        print("✅ MaxDrawdownGuard module imported")
        
        return True
    except Exception as e:
        print(f"❌ Import failed: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_config():
    """Test configuration system."""
    print("\n⚙️  Testing configuration...")
    
    try:
        from core.util.config import get_config
        config = get_config()
        
        print(f"✅ Config loaded: {config.symbol} {config.timeframe}")
        print(f"   - Broker: {config.broker}")
        print(f"   - Risk per trade: {config.risk_per_trade}")
        print(f"   - Max drawdown: {config.max_drawdown_pct}")
        
        return True
    except Exception as e:
        print(f"❌ Config test failed: {e}")
        return False

def test_logging():
    """Test logging system."""
    print("\n📝 Testing logging...")
    
    try:
        from core.util.logger import get_logger
        logger = get_logger(__name__)
        
        logger.info("Test info message")
        logger.warning("Test warning message")
        logger.error("Test error message")
        
        print("✅ Logging system working")
        return True
    except Exception as e:
        print(f"❌ Logging test failed: {e}")
        return False

def test_data_loader():
    """Test data loader."""
    print("\n📊 Testing data loader...")
    
    try:
        from core.data.loaders import DataLoader
        data_loader = DataLoader()
        
        # Test with sample data
        sample_file = project_root / 'sample' / 'XAUUSD_1h.csv'
        if sample_file.exists():
            df = pd.read_csv(sample_file, index_col=0, parse_dates=True)
            print(f"✅ Sample data loaded: {len(df)} bars")
        else:
            print("⚠️  Sample data not found, creating...")
            # Create minimal sample data
            dates = pd.date_range(start='2024-01-01', end='2024-01-02', freq='1H')
            df = pd.DataFrame({
                'open': 2000 + np.random.randn(len(dates)) * 10,
                'high': 2000 + np.random.randn(len(dates)) * 10 + 5,
                'low': 2000 + np.random.randn(len(dates)) * 10 - 5,
                'close': 2000 + np.random.randn(len(dates)) * 10,
                'volume': np.random.randint(1000, 5000, len(dates))
            }, index=dates)
            
            sample_file.parent.mkdir(parents=True, exist_ok=True)
            df.to_csv(sample_file)
            print(f"✅ Sample data created: {len(df)} bars")
        
        return True
    except Exception as e:
        print(f"❌ Data loader test failed: {e}")
        return False

def test_feature_engineering():
    """Test feature engineering."""
    print("\n🔧 Testing feature engineering...")
    
    try:
        from core.ml.featureset import FeatureSet
        from core.data.loaders import DataLoader
        
        # Load sample data
        sample_file = project_root / 'sample' / 'XAUUSD_1h.csv'
        df = pd.read_csv(sample_file, index_col=0, parse_dates=True)
        
        # Test feature engineering
        feature_set = FeatureSet()
        features_df = feature_set.calculate_technical_indicators(df)
        
        print(f"✅ Features calculated: {features_df.shape[1]} features")
        print(f"   - RSI: {features_df['rsi'].notna().sum()} valid values")
        print(f"   - MACD: {features_df['macd'].notna().sum()} valid values")
        print(f"   - ATR: {features_df['atr'].notna().sum()} valid values")
        
        return True
    except Exception as e:
        print(f"❌ Feature engineering test failed: {e}")
        return False

def test_ml_pipeline():
    """Test ML pipeline."""
    print("\n🤖 Testing ML pipeline...")
    
    try:
        from core.ml.featureset import FeatureSet
        from core.ml.labeler import Labeler
        from core.ml.xgb_model import XGBModel
        
        # Load sample data
        sample_file = project_root / 'sample' / 'XAUUSD_1h.csv'
        df = pd.read_csv(sample_file, index_col=0, parse_dates=True)
        
        # Prepare features and labels
        feature_set = FeatureSet()
        labeler = Labeler(horizon=3, threshold=0.001)
        
        features_df = feature_set.calculate_technical_indicators(df)
        labels = labeler.create_labels(features_df)
        
        X, y = feature_set.prepare_features(features_df, target_col='close')
        
        print(f"✅ Data prepared: {X.shape[0]} samples, {X.shape[1]} features")
        
        # Test model training
        model = XGBModel()
        train_metrics = model.train(X, y, calibrate=True)
        
        print(f"✅ Model trained successfully!")
        print(f"   - Training Accuracy: {train_metrics['train_metrics']['accuracy']:.3f}")
        print(f"   - Validation Accuracy: {train_metrics['val_metrics']['accuracy']:.3f}")
        
        # Test prediction
        predictions = model.predict(X[:10])
        probabilities = model.predict_proba(X[:10])
        
        print(f"✅ Predictions generated: {len(predictions)} predictions")
        print(f"   - Prediction range: {predictions.min()} to {predictions.max()}")
        print(f"   - Probability range: {probabilities.min():.3f} to {probabilities.max():.3f}")
        
        return True
    except Exception as e:
        print(f"❌ ML pipeline test failed: {e}")
        return False

def test_backtesting():
    """Test backtesting engine."""
    print("\n📈 Testing backtesting engine...")
    
    try:
        from core.backtest.engine import BacktestEngine
        
        # Load sample data
        sample_file = project_root / 'sample' / 'XAUUSD_1h.csv'
        df = pd.read_csv(sample_file, index_col=0, parse_dates=True)
        
        # Test EMA strategy
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
        
        print(f"✅ Backtest completed successfully!")
        print(f"   - Total Return: {results['performance_metrics']['total_return']:.2%}")
        print(f"   - Sharpe Ratio: {results['performance_metrics']['sharpe_ratio']:.3f}")
        print(f"   - Max Drawdown: {results['performance_metrics']['max_drawdown']:.2%}")
        print(f"   - Total Trades: {results['performance_metrics']['total_trades']}")
        
        return True
    except Exception as e:
        print(f"❌ Backtesting test failed: {e}")
        return False

def test_paper_trading():
    """Test paper trading."""
    print("\n💰 Testing paper trading...")
    
    try:
        from core.adapters.paper.broker import PaperBroker
        
        # Initialize broker
        broker = PaperBroker()
        broker.set_initial_balance(10000.0)
        
        print(f"✅ Paper broker initialized: ${broker.get_balance()['total_value']:.2f}")
        
        # Test order placement
        result = broker.place_order('XAUUSD', 'buy', 0.1, 2000.0)
        
        if result['success']:
            print(f"✅ Order placed successfully: {result['order_id']}")
        else:
            print(f"❌ Order placement failed: {result['error']}")
            return False
        
        # Test balance update
        balance = broker.get_balance()
        print(f"✅ Balance updated: ${balance['total_value']:.2f}")
        
        # Test performance metrics
        metrics = broker.get_performance_metrics()
        print(f"✅ Performance metrics: {metrics['total_trades']} trades")
        
        return True
    except Exception as e:
        print(f"❌ Paper trading test failed: {e}")
        return False

def test_risk_management():
    """Test risk management."""
    print("\n🛡️  Testing risk management...")
    
    try:
        from core.risk.position_sizing import PositionSizer
        from core.risk.max_drawdown_guard import MaxDrawdownGuard
        
        # Test position sizing
        position_sizer = PositionSizer()
        size = position_sizer.calculate_size(0.8, 10000.0, 0.01)
        print(f"✅ Position sizing: {size:.2f} for confidence 0.8")
        
        # Test drawdown guard
        drawdown_guard = MaxDrawdownGuard()
        
        # Test with decreasing values
        values = [10000, 9500, 9000, 8500, 8000]
        for value in values:
            can_trade = drawdown_guard.check_limits(value)
            print(f"   Value ${value}: {'✅ Can trade' if can_trade else '❌ Stop trading'}")
        
        return True
    except Exception as e:
        print(f"❌ Risk management test failed: {e}")
        return False

def main():
    """Main test function."""
    print("🧪 SB1 ALPHA System Test")
    print("=" * 50)
    
    tests = [
        ("Imports", test_imports),
        ("Configuration", test_config),
        ("Logging", test_logging),
        ("Data Loader", test_data_loader),
        ("Feature Engineering", test_feature_engineering),
        ("ML Pipeline", test_ml_pipeline),
        ("Backtesting", test_backtesting),
        ("Paper Trading", test_paper_trading),
        ("Risk Management", test_risk_management),
    ]
    
    passed = 0
    total = len(tests)
    
    for test_name, test_func in tests:
        try:
            if test_func():
                passed += 1
            else:
                print(f"❌ {test_name} test failed")
        except Exception as e:
            print(f"❌ {test_name} test failed with exception: {e}")
    
    print("\n" + "=" * 50)
    print(f"📊 Test Results: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All tests passed! SB1 ALPHA is ready to use.")
        return 0
    else:
        print("⚠️  Some tests failed. Please check the errors above.")
        return 1

if __name__ == "__main__":
    exit(main())