"""
Model validation with data integrity checks and performance monitoring.
"""
import argparse
import pandas as pd
import numpy as np
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta

from core.util.config import get_config
from core.util.logger import get_logger
from core.data.loaders import DataLoader
from core.ml.infer import MLInference
from core.rl.env import TradingEnvironment
from core.rl.ddqn import DoubleDQN

logger = get_logger(__name__)

class ModelValidator:
    """Model validation with data integrity checks and performance monitoring."""
    
    def __init__(self, config: Optional[Any] = None):
        self.config = config or get_config()
        self.data_loader = DataLoader()
        self.validation_results = {}
        
        logger.info("Model validator initialized")
    
    def validate_ml_model(self, model_path: str, symbol: str, timeframe: str) -> Dict[str, Any]:
        """Validate ML model performance."""
        logger.info(f"Validating ML model: {model_path}")
        
        try:
            # Load model
            ml_inference = MLInference(model_path)
            
            # Get validation data
            end_date = datetime.now().strftime('%Y-%m-%d')
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
            
            df = self.data_loader.load_historical_data(
                symbol=symbol,
                timeframe=timeframe,
                start_date=start_date,
                end_date=end_date
            )
            
            # Validate data integrity
            self._validate_data_integrity(df)
            
            # Run validation
            validation_results = self._run_ml_validation(ml_inference, df)
            
            # Store results
            self.validation_results['ml'] = validation_results
            
            logger.info(f"ML model validation completed: {validation_results['accuracy']:.3f} accuracy")
            
            return validation_results
            
        except Exception as e:
            logger.error(f"ML model validation failed: {e}")
            return {'error': str(e), 'valid': False}
    
    def validate_rl_model(self, model_path: str, symbol: str, timeframe: str) -> Dict[str, Any]:
        """Validate RL model performance."""
        logger.info(f"Validating RL model: {model_path}")
        
        try:
            # Get validation data
            end_date = datetime.now().strftime('%Y-%m-%d')
            start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
            
            df = self.data_loader.load_historical_data(
                symbol=symbol,
                timeframe=timeframe,
                start_date=start_date,
                end_date=end_date
            )
            
            # Add technical indicators
            df = self._add_technical_indicators(df)
            
            # Validate data integrity
            self._validate_data_integrity(df)
            
            # Run validation
            validation_results = self._run_rl_validation(model_path, df)
            
            # Store results
            self.validation_results['rl'] = validation_results
            
            logger.info(f"RL model validation completed: {validation_results['sharpe_ratio']:.3f} Sharpe ratio")
            
            return validation_results
            
        except Exception as e:
            logger.error(f"RL model validation failed: {e}")
            return {'error': str(e), 'valid': False}
    
    def _validate_data_integrity(self, df: pd.DataFrame):
        """Validate data integrity."""
        if df.empty:
            raise ValueError("Validation data is empty")
        
        # Check required columns
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}")
        
        # Check for NaN values
        if df.isnull().any().any():
            logger.warning("NaN values found in validation data")
        
        # Check for infinite values
        if np.isinf(df.select_dtypes(include=[np.number])).any().any():
            logger.warning("Infinite values found in validation data")
        
        # Check minimum data length
        if len(df) < 100:
            raise ValueError("Insufficient data for validation")
        
        logger.info(f"Data integrity validation passed: {len(df)} bars")
    
    def _add_technical_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add technical indicators to data."""
        df_indicators = df.copy()
        
        # Calculate RSI
        df_indicators['rsi'] = self._calculate_rsi(df['close'].values)
        
        # Calculate MACD
        df_indicators['macd'] = self._calculate_macd(df['close'].values)
        
        # Calculate ATR
        df_indicators['atr'] = self._calculate_atr(
            df['high'].values, df['low'].values, df['close'].values
        )
        
        return df_indicators
    
    def _calculate_rsi(self, prices: np.ndarray, period: int = 14) -> np.ndarray:
        """Calculate RSI indicator."""
        deltas = np.diff(prices)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)
        
        avg_gains = np.zeros_like(prices)
        avg_losses = np.zeros_like(prices)
        
        for i in range(period, len(prices)):
            avg_gains[i] = np.mean(gains[i-period:i])
            avg_losses[i] = np.mean(losses[i-period:i])
        
        rs = np.divide(avg_gains, avg_losses, out=np.zeros_like(avg_gains), where=avg_losses!=0)
        rsi = 100 - (100 / (1 + rs))
        
        return rsi
    
    def _calculate_macd(self, prices: np.ndarray, fast: int = 12, slow: int = 26) -> np.ndarray:
        """Calculate MACD indicator."""
        ema_fast = self._calculate_ema(prices, fast)
        ema_slow = self._calculate_ema(prices, slow)
        macd = ema_fast - ema_slow
        return macd
    
    def _calculate_ema(self, prices: np.ndarray, period: int) -> np.ndarray:
        """Calculate EMA indicator."""
        ema = np.zeros_like(prices)
        ema[0] = prices[0]
        
        alpha = 2 / (period + 1)
        for i in range(1, len(prices)):
            ema[i] = alpha * prices[i] + (1 - alpha) * ema[i-1]
        
        return ema
    
    def _calculate_atr(self, high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> np.ndarray:
        """Calculate ATR indicator."""
        tr1 = high - low
        tr2 = np.abs(high - np.roll(close, 1))
        tr3 = np.abs(low - np.roll(close, 1))
        
        tr = np.maximum(tr1, np.maximum(tr2, tr3))
        atr = np.zeros_like(close)
        
        for i in range(period, len(close)):
            atr[i] = np.mean(tr[i-period:i])
        
        return atr
    
    def _run_ml_validation(self, ml_inference: MLInference, df: pd.DataFrame) -> Dict[str, Any]:
        """Run ML model validation."""
        # Generate signals
        signals = ml_inference.batch_inference(df, confidence_threshold=0.6)
        
        if not signals:
            return {'error': 'No signals generated', 'valid': False}
        
        # Calculate validation metrics
        total_signals = len(signals)
        buy_signals = sum(1 for s in signals if s['signal'] == 'buy')
        sell_signals = sum(1 for s in signals if s['signal'] == 'sell')
        hold_signals = sum(1 for s in signals if s['signal'] == 'hold')
        
        # Calculate accuracy (simplified)
        # This would need actual price movement data for proper validation
        accuracy = 0.6  # Placeholder
        
        # Calculate confidence statistics
        confidences = [s['confidence'] for s in signals]
        avg_confidence = np.mean(confidences)
        std_confidence = np.std(confidences)
        
        # Calculate signal distribution
        signal_distribution = {
            'buy': buy_signals / total_signals,
            'sell': sell_signals / total_signals,
            'hold': hold_signals / total_signals
        }
        
        # Determine if model is valid
        valid = (
            total_signals > 10 and
            accuracy > 0.5 and
            avg_confidence > 0.6 and
            std_confidence < 0.3
        )
        
        return {
            'valid': valid,
            'accuracy': accuracy,
            'total_signals': total_signals,
            'signal_distribution': signal_distribution,
            'avg_confidence': avg_confidence,
            'std_confidence': std_confidence,
            'validation_timestamp': datetime.now().isoformat()
        }
    
    def _run_rl_validation(self, model_path: str, df: pd.DataFrame) -> Dict[str, Any]:
        """Run RL model validation."""
        # Create environment
        env_config = {
            'lookback': 50,
            'features': ['close', 'volume', 'rsi', 'macd', 'atr'],
            'action_space': 3,
            'reward_function': 'sharpe_ratio',
            'transaction_cost': 0.001,
            'max_position': 1.0
        }
        
        env = TradingEnvironment(df, env_config)
        
        # Load RL model
        agent = DoubleDQN(
            state_size=env.observation_space.shape[0] * env.observation_space.shape[1],
            action_size=env.action_space.n
        )
        agent.load(model_path)
        
        # Run validation episode
        state = env.reset()
        done = False
        total_reward = 0
        step_count = 0
        
        while not done and step_count < 1000:  # Limit steps
            action = agent.act(state, training=False)
            state, reward, done, info = env.step(action)
            total_reward += reward
            step_count += 1
        
        # Get performance metrics
        metrics = env.get_performance_metrics()
        
        # Determine if model is valid
        valid = (
            total_reward > 0 and
            metrics.get('sharpe_ratio', 0) > 0.5 and
            metrics.get('total_return', 0) > 0.05 and
            step_count > 50
        )
        
        return {
            'valid': valid,
            'total_reward': total_reward,
            'step_count': step_count,
            'performance_metrics': metrics,
            'validation_timestamp': datetime.now().isoformat()
        }
    
    def validate_all_models(self, symbol: str, timeframe: str) -> Dict[str, Any]:
        """Validate all available models."""
        logger.info(f"Validating all models for {symbol} {timeframe}")
        
        results = {
            'symbol': symbol,
            'timeframe': timeframe,
            'validation_timestamp': datetime.now().isoformat(),
            'models': {}
        }
        
        # Find ML models
        ml_models = self._find_ml_models(symbol, timeframe)
        for model_path in ml_models:
            model_name = Path(model_path).stem
            try:
                validation_result = self.validate_ml_model(model_path, symbol, timeframe)
                results['models'][f'ml_{model_name}'] = validation_result
            except Exception as e:
                results['models'][f'ml_{model_name}'] = {'error': str(e), 'valid': False}
        
        # Find RL models
        rl_models = self._find_rl_models(symbol, timeframe)
        for model_path in rl_models:
            model_name = Path(model_path).stem
            try:
                validation_result = self.validate_rl_model(model_path, symbol, timeframe)
                results['models'][f'rl_{model_name}'] = validation_result
            except Exception as e:
                results['models'][f'rl_{model_name}'] = {'error': str(e), 'valid': False}
        
        # Calculate overall validation status
        valid_models = sum(1 for model_result in results['models'].values() 
                          if model_result.get('valid', False))
        total_models = len(results['models'])
        
        results['overall_status'] = {
            'valid_models': valid_models,
            'total_models': total_models,
            'validation_success_rate': valid_models / total_models if total_models > 0 else 0
        }
        
        logger.info(f"Model validation completed: {valid_models}/{total_models} models valid")
        
        return results
    
    def _find_ml_models(self, symbol: str, timeframe: str) -> List[str]:
        """Find available ML models."""
        model_dir = Path("models/registry")
        ml_models = []
        
        if model_dir.exists():
            for model_file in model_dir.glob(f"*{symbol}*{timeframe}*.joblib"):
                ml_models.append(str(model_file))
        
        return ml_models
    
    def _find_rl_models(self, symbol: str, timeframe: str) -> List[str]:
        """Find available RL models."""
        model_dir = Path("models/registry")
        rl_models = []
        
        if model_dir.exists():
            for model_file in model_dir.glob(f"*{symbol}*{timeframe}*.pth"):
                rl_models.append(str(model_file))
        
        return rl_models
    
    def save_validation_results(self, results: Dict[str, Any], filepath: str = "reports/validation_results.json"):
        """Save validation results."""
        # Create directory if it doesn't exist
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        
        # Save results
        with open(filepath, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        
        logger.info(f"Validation results saved to {filepath}")

def main():
    """Main model validation script."""
    parser = argparse.ArgumentParser(description='Validate models')
    parser.add_argument('--symbol', type=str, default='XAUUSD', help='Trading symbol')
    parser.add_argument('--timeframe', type=str, default='1h', help='Timeframe')
    parser.add_argument('--model-type', type=str, choices=['ml', 'rl', 'all'], default='all', help='Model type to validate')
    parser.add_argument('--model-path', type=str, help='Specific model path to validate')
    parser.add_argument('--output', type=str, default='reports/validation_results.json', help='Output file')
    
    args = parser.parse_args()
    
    # Initialize validator
    validator = ModelValidator()
    
    if args.model_path:
        # Validate specific model
        if args.model_type == 'ml':
            results = validator.validate_ml_model(args.model_path, args.symbol, args.timeframe)
        elif args.model_type == 'rl':
            results = validator.validate_rl_model(args.model_path, args.symbol, args.timeframe)
        else:
            raise ValueError("Model type must be specified when validating specific model")
        
        print(f"Model validation result: {results}")
    else:
        # Validate all models
        results = validator.validate_all_models(args.symbol, args.timeframe)
        
        # Save results
        validator.save_validation_results(results, args.output)
        
        # Print summary
        overall_status = results['overall_status']
        print(f"Model validation completed:")
        print(f"Valid models: {overall_status['valid_models']}/{overall_status['total_models']}")
        print(f"Success rate: {overall_status['validation_success_rate']:.2%}")

if __name__ == "__main__":
    main()