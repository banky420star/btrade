"""
ML inference with data integrity validation and real-time signal generation.
"""
import pandas as pd
import numpy as np
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
import time

from core.util.config import get_config
from core.util.logger import get_logger
from core.data.loaders import DataLoader
from core.ml.featureset import FeatureSet
from core.ml.xgb_model import XGBModel

logger = get_logger(__name__)

class MLInference:
    """ML inference with data integrity validation and real-time signal generation."""
    
    def __init__(self, model_path: str, config: Optional[Any] = None):
        self.config = config or get_config()
        self.model_path = model_path
        self.model = None
        self.feature_set = FeatureSet()
        self.data_loader = DataLoader()
        self.signal_buffer = []
        self.last_inference_time = None
        
        # Load model
        self._load_model()
    
    def _load_model(self):
        """Load trained model with data integrity validation."""
        if not Path(self.model_path).exists():
            raise FileNotFoundError(f"Model file not found: {self.model_path}")
        
        # Load model
        self.model = XGBModel()
        self.model.load_model(self.model_path)
        
        # Validate model
        if self.model.model is None:
            raise ValueError("Failed to load model")
        
        logger.info(f"Model loaded from {self.model_path}")
        logger.info(f"Model info: {self.model.get_model_info()}")
    
    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Prepare features for inference with data integrity validation."""
        # Validate input data
        self._validate_input_data(df)
        
        # Calculate technical indicators
        features_df = self.feature_set.calculate_technical_indicators(df)
        
        # Get feature columns
        feature_cols = self.feature_set.get_feature_columns()
        
        # Select only available features
        available_features = [col for col in feature_cols if col in features_df.columns]
        
        # Prepare feature matrix
        X = features_df[available_features].copy()
        
        # Handle NaN values
        X = X.fillna(method='ffill').fillna(method='bfill')
        
        # Validate features
        self._validate_features(X)
        
        return X
    
    def _validate_input_data(self, df: pd.DataFrame):
        """Validate input data integrity."""
        if df.empty:
            raise ValueError("Input data is empty")
        
        # Check required columns
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}")
        
        # Check for recent data
        if hasattr(df.index, 'max'):
            latest_time = df.index.max()
            if isinstance(latest_time, pd.Timestamp):
                time_diff = datetime.now() - latest_time.to_pydatetime()
                if time_diff.total_seconds() > 3600:  # 1 hour
                    logger.warning(f"Data is {time_diff} old")
    
    def _validate_features(self, X: pd.DataFrame):
        """Validate feature data integrity."""
        # Check for NaN values
        if X.isnull().any().any():
            logger.warning("NaN values found in features")
        
        # Check for infinite values
        if np.isinf(X.select_dtypes(include=[np.number])).any().any():
            logger.warning("Infinite values found in features")
        
        # Check feature dimensions
        if X.shape[1] == 0:
            raise ValueError("No features available for inference")
    
    def predict(self, df: pd.DataFrame) -> Tuple[np.ndarray, np.ndarray]:
        """Make predictions with data integrity validation."""
        # Prepare features
        X = self.prepare_features(df)
        
        # Make predictions
        predictions = self.model.predict(X)
        probabilities = self.model.predict_proba(X)
        
        # Validate predictions
        self._validate_predictions(predictions, probabilities)
        
        return predictions, probabilities
    
    def _validate_predictions(self, predictions: np.ndarray, probabilities: np.ndarray):
        """Validate prediction data integrity."""
        # Check prediction values
        if not np.all(np.isin(predictions, [0, 1])):
            logger.warning("Invalid prediction values found")
        
        # Check probability values
        if not np.all((probabilities >= 0) & (probabilities <= 1)):
            logger.warning("Invalid probability values found")
        
        # Check probability sum
        prob_sums = probabilities.sum(axis=1)
        if not np.allclose(prob_sums, 1.0, atol=1e-6):
            logger.warning("Probability sums are not close to 1")
    
    def generate_signal(self, df: pd.DataFrame, 
                       confidence_threshold: float = 0.6) -> Dict[str, Any]:
        """Generate trading signal with data integrity validation."""
        # Make predictions
        predictions, probabilities = self.predict(df)
        
        # Get latest prediction
        latest_prediction = predictions[-1]
        latest_probability = probabilities[-1, 1]  # Probability of positive class
        
        # Determine signal
        if latest_probability >= confidence_threshold:
            signal = 'buy'
        elif latest_probability <= (1 - confidence_threshold):
            signal = 'sell'
        else:
            signal = 'hold'
        
        # Create signal data
        signal_data = {
            'id': f"signal_{int(time.time() * 1000)}",
            'symbol': self.config.symbol,
            'signal': signal,
            'confidence': latest_probability,
            'model': 'ml',
            'timestamp': datetime.now().isoformat(),
            'price': df['close'].iloc[-1],
            'metadata': {
                'prediction': int(latest_prediction),
                'probability_positive': float(latest_probability),
                'probability_negative': float(probabilities[-1, 0]),
                'confidence_threshold': confidence_threshold,
                'model_path': self.model_path
            }
        }
        
        # Validate signal
        self._validate_signal(signal_data)
        
        # Log signal
        from core.util.logger import log_signal
        log_signal(signal_data)
        
        # Add to buffer
        self.signal_buffer.append(signal_data)
        
        # Keep only last 100 signals
        if len(self.signal_buffer) > 100:
            self.signal_buffer = self.signal_buffer[-100:]
        
        self.last_inference_time = datetime.now()
        
        logger.info(f"Signal generated: {signal} (confidence: {latest_probability:.3f})")
        
        return signal_data
    
    def _validate_signal(self, signal_data: Dict[str, Any]):
        """Validate signal data integrity."""
        required_fields = ['id', 'symbol', 'signal', 'confidence', 'model', 'timestamp']
        for field in required_fields:
            if field not in signal_data:
                raise ValueError(f"Missing required field: {field}")
        
        if signal_data['signal'] not in ['buy', 'sell', 'hold']:
            raise ValueError("Invalid signal type")
        
        if not (0 <= signal_data['confidence'] <= 1):
            raise ValueError("Confidence must be between 0 and 1")
    
    def batch_inference(self, df: pd.DataFrame, 
                       confidence_threshold: float = 0.6) -> List[Dict[str, Any]]:
        """Perform batch inference on historical data."""
        signals = []
        
        # Make predictions
        predictions, probabilities = self.predict(df)
        
        # Generate signals for each prediction
        for i, (pred, prob) in enumerate(zip(predictions, probabilities)):
            prob_positive = prob[1]
            
            # Determine signal
            if prob_positive >= confidence_threshold:
                signal = 'buy'
            elif prob_positive <= (1 - confidence_threshold):
                signal = 'sell'
            else:
                signal = 'hold'
            
            # Create signal data
            signal_data = {
                'id': f"signal_{int(time.time() * 1000)}_{i}",
                'symbol': self.config.symbol,
                'signal': signal,
                'confidence': prob_positive,
                'model': 'ml',
                'timestamp': df.index[i].isoformat() if hasattr(df.index[i], 'isoformat') else str(df.index[i]),
                'price': df['close'].iloc[i],
                'metadata': {
                    'prediction': int(pred),
                    'probability_positive': float(prob_positive),
                    'probability_negative': float(prob[0]),
                    'confidence_threshold': confidence_threshold
                }
            }
            
            signals.append(signal_data)
        
        logger.info(f"Batch inference completed: {len(signals)} signals generated")
        
        return signals
    
    def save_signals(self, signals: List[Dict[str, Any]], 
                    filepath: str = "runtime/signal_fifo.jsonl"):
        """Save signals to file."""
        # Create directory if it doesn't exist
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        
        # Save signals
        with open(filepath, 'a') as f:
            for signal in signals:
                f.write(json.dumps(signal) + '\n')
        
        logger.info(f"Signals saved to {filepath}")
    
    def get_model_performance(self) -> Dict[str, Any]:
        """Get model performance metrics."""
        if self.model is None:
            return {'status': 'not_loaded'}
        
        return {
            'status': 'loaded',
            'model_path': self.model_path,
            'model_info': self.model.get_model_info(),
            'last_inference_time': self.last_inference_time.isoformat() if self.last_inference_time else None,
            'signal_buffer_size': len(self.signal_buffer)
        }

def main():
    """Main inference script."""
    import argparse
    
    parser = argparse.ArgumentParser(description='ML Inference')
    parser.add_argument('--model-path', type=str, required=True, help='Path to trained model')
    parser.add_argument('--symbol', type=str, default='XAUUSD', help='Trading symbol')
    parser.add_argument('--timeframe', type=str, default='1h', help='Timeframe')
    parser.add_argument('--confidence-threshold', type=float, default=0.6, help='Confidence threshold')
    parser.add_argument('--batch', action='store_true', help='Run batch inference')
    parser.add_argument('--start-date', type=str, help='Start date for batch inference')
    parser.add_argument('--end-date', type=str, help='End date for batch inference')
    
    args = parser.parse_args()
    
    # Initialize inference
    inference = MLInference(args.model_path)
    
    if args.batch:
        # Batch inference
        from core.data.loaders import DataLoader
        data_loader = DataLoader()
        
        df = data_loader.load_historical_data(
            symbol=args.symbol,
            timeframe=args.timeframe,
            start_date=args.start_date,
            end_date=args.end_date
        )
        
        signals = inference.batch_inference(df, args.confidence_threshold)
        inference.save_signals(signals)
        
        print(f"Batch inference completed: {len(signals)} signals generated")
    else:
        # Real-time inference
        from core.data.loaders import DataLoader
        data_loader = DataLoader()
        
        # Load recent data
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - pd.Timedelta(days=7)).strftime('%Y-%m-%d')
        
        df = data_loader.load_historical_data(
            symbol=args.symbol,
            timeframe=args.timeframe,
            start_date=start_date,
            end_date=end_date
        )
        
        signal = inference.generate_signal(df, args.confidence_threshold)
        print(f"Signal generated: {signal}")

if __name__ == "__main__":
    main()