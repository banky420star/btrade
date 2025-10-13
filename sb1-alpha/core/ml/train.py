"""
ML training script with data integrity validation and walk-forward validation.
"""
import argparse
import yaml
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, Any, List, Tuple
from datetime import datetime, timedelta
import json

from core.util.config import get_config
from core.util.logger import get_logger
from core.data.loaders import DataLoader
from core.ml.featureset import FeatureSet
from core.ml.labeler import Labeler
from core.ml.xgb_model import XGBModel
from core.ml.calibrate import ModelCalibrator

logger = get_logger(__name__)

class MLTrainer:
    """ML training with data integrity validation and walk-forward validation."""
    
    def __init__(self, config_path: str = "configs/ml.yaml"):
        self.config = self._load_config(config_path)
        self.data_loader = DataLoader()
        self.feature_set = FeatureSet()
        self.labeler = Labeler(
            horizon=self.config['labeling']['horizon'],
            threshold=self.config['labeling']['threshold']
        )
        self.model = XGBModel(self.config['model']['params'])
        self.calibrator = ModelCalibrator(
            method=self.config['calibration']['method'],
            cv=self.config['calibration']['cv_folds']
        )
        self.training_results = {}
    
    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load ML configuration."""
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        return config
    
    def load_data(self, symbol: str, timeframe: str, 
                  start_date: str, end_date: str) -> pd.DataFrame:
        """Load and validate data."""
        logger.info(f"Loading data for {symbol} {timeframe} from {start_date} to {end_date}")
        
        # Load data
        df = self.data_loader.load_historical_data(
            symbol=symbol,
            timeframe=timeframe,
            start_date=start_date,
            end_date=end_date
        )
        
        # Validate data integrity
        self._validate_data_integrity(df)
        
        logger.info(f"Loaded {len(df)} data points")
        return df
    
    def _validate_data_integrity(self, df: pd.DataFrame):
        """Validate data integrity."""
        # Check required columns
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}")
        
        # Check for NaN values
        nan_counts = df.isnull().sum()
        if nan_counts.any():
            logger.warning(f"NaN values found: {nan_counts[nan_counts > 0].to_dict()}")
        
        # Check for infinite values
        inf_counts = np.isinf(df.select_dtypes(include=[np.number])).sum()
        if inf_counts.any():
            logger.warning(f"Infinite values found: {inf_counts[inf_counts > 0].to_dict()}")
        
        # Check for duplicate timestamps
        if df.index.duplicated().any():
            logger.warning("Duplicate timestamps found")
        
        # Check for gaps in data
        if hasattr(df.index, 'to_pydatetime'):
            time_diffs = df.index.to_series().diff()
            expected_freq = pd.Timedelta(hours=1) if '1h' in str(df.index[0]) else pd.Timedelta(minutes=1)
            large_gaps = time_diffs > expected_freq * 2
            if large_gaps.any():
                logger.warning(f"Large time gaps found: {large_gaps.sum()}")
        
        logger.info("Data integrity validation passed")
    
    def prepare_features_and_labels(self, df: pd.DataFrame) -> Tuple[pd.DataFrame, pd.Series]:
        """Prepare features and labels with data integrity validation."""
        logger.info("Preparing features and labels")
        
        # Calculate features
        features_df = self.feature_set.calculate_technical_indicators(df)
        
        # Create labels
        labels = self.labeler.create_labels(features_df)
        
        # Prepare feature matrix
        X, y = self.feature_set.prepare_features(features_df, target_col='close')
        
        # Align features and labels
        common_index = X.index.intersection(labels.index)
        X = X.loc[common_index]
        y = y.loc[common_index]
        
        # Remove rows with NaN values
        valid_mask = ~(X.isnull().any(axis=1) | y.isnull())
        X = X[valid_mask]
        y = y[valid_mask]
        
        logger.info(f"Prepared {X.shape[0]} samples with {X.shape[1]} features")
        
        return X, y
    
    def walk_forward_validation(self, X: pd.DataFrame, y: pd.Series, 
                               n_splits: int = 5) -> List[Dict[str, Any]]:
        """Perform walk-forward validation."""
        logger.info(f"Performing walk-forward validation with {n_splits} splits")
        
        # Sort by index to ensure chronological order
        sorted_indices = X.index.sort_values()
        X_sorted = X.loc[sorted_indices]
        y_sorted = y.loc[sorted_indices]
        
        # Calculate split sizes
        total_samples = len(X_sorted)
        split_size = total_samples // n_splits
        
        results = []
        
        for i in range(n_splits - 1):
            # Calculate train and test indices
            train_end = (i + 1) * split_size
            test_start = train_end
            test_end = min((i + 2) * split_size, total_samples)
            
            if test_end - test_start < 10:  # Minimum test size
                continue
            
            # Split data
            X_train = X_sorted.iloc[:train_end]
            y_train = y_sorted.iloc[:train_end]
            X_test = X_sorted.iloc[test_start:test_end]
            y_test = y_sorted.iloc[test_start:test_end]
            
            logger.info(f"Split {i+1}: Train={len(X_train)}, Test={len(X_test)}")
            
            # Train model
            model = XGBModel(self.config['model']['params'])
            train_metrics = model.train(X_train, y_train, calibrate=True)
            
            # Evaluate on test set
            test_metrics = model._evaluate_model(model.model, X_test, y_test)
            
            # Store results
            split_result = {
                'split': i + 1,
                'train_samples': len(X_train),
                'test_samples': len(X_test),
                'train_metrics': train_metrics,
                'test_metrics': test_metrics,
                'feature_importance': model.get_feature_importance()
            }
            
            results.append(split_result)
            
            logger.info(f"Split {i+1} test metrics: {test_metrics}")
        
        return results
    
    def train_final_model(self, X: pd.DataFrame, y: pd.Series) -> Dict[str, Any]:
        """Train final model on all data."""
        logger.info("Training final model on all data")
        
        # Train model
        train_metrics = self.model.train(X, y, calibrate=True)
        
        # Cross-validation
        cv_metrics = self.model.cross_validate(X, y, cv=5)
        
        # Store results
        self.training_results = {
            'train_metrics': train_metrics,
            'cv_metrics': cv_metrics,
            'feature_importance': self.model.get_feature_importance(),
            'training_samples': len(X),
            'features': list(X.columns),
            'timestamp': datetime.now().isoformat()
        }
        
        logger.info(f"Final model training completed: {train_metrics}")
        
        return self.training_results
    
    def save_model(self, symbol: str, timeframe: str, model_dir: str = "models/registry"):
        """Save trained model and metadata."""
        if self.model.model is None:
            raise ValueError("Model not trained")
        
        # Create model directory
        model_path = Path(model_dir)
        model_path.mkdir(parents=True, exist_ok=True)
        
        # Generate model filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        model_filename = f"xgb_{symbol}_{timeframe}_{timestamp}.joblib"
        model_filepath = model_path / model_filename
        
        # Save model
        self.model.save_model(str(model_filepath))
        
        # Save training results
        results_filename = f"xgb_{symbol}_{timeframe}_{timestamp}_results.json"
        results_filepath = model_path / results_filename
        
        with open(results_filepath, 'w') as f:
            json.dump(self.training_results, f, indent=2)
        
        # Save latest model reference
        latest_filepath = model_path / f"xgb_{symbol}_{timeframe}_latest.joblib"
        self.model.save_model(str(latest_filepath))
        
        logger.info(f"Model saved to {model_filepath}")
        logger.info(f"Training results saved to {results_filepath}")
        
        return str(model_filepath)
    
    def train(self, symbol: str, timeframe: str, 
              start_date: str, end_date: str,
              walk_forward: bool = True) -> Dict[str, Any]:
        """Main training pipeline."""
        logger.info(f"Starting ML training for {symbol} {timeframe}")
        
        # Load data
        df = self.load_data(symbol, timeframe, start_date, end_date)
        
        # Prepare features and labels
        X, y = self.prepare_features_and_labels(df)
        
        # Walk-forward validation
        if walk_forward:
            wf_results = self.walk_forward_validation(X, y)
            logger.info(f"Walk-forward validation completed: {len(wf_results)} splits")
        
        # Train final model
        final_results = self.train_final_model(X, y)
        
        # Save model
        model_path = self.save_model(symbol, timeframe)
        
        # Compile results
        results = {
            'symbol': symbol,
            'timeframe': timeframe,
            'start_date': start_date,
            'end_date': end_date,
            'final_results': final_results,
            'model_path': model_path,
            'timestamp': datetime.now().isoformat()
        }
        
        if walk_forward:
            results['walk_forward_results'] = wf_results
        
        logger.info("ML training completed successfully")
        
        return results

def main():
    """Main training script."""
    parser = argparse.ArgumentParser(description='Train ML model')
    parser.add_argument('--symbol', type=str, default='XAUUSD', help='Trading symbol')
    parser.add_argument('--timeframe', type=str, default='1h', help='Timeframe')
    parser.add_argument('--start-date', type=str, required=True, help='Start date (YYYY-MM-DD)')
    parser.add_argument('--end-date', type=str, required=True, help='End date (YYYY-MM-DD)')
    parser.add_argument('--config', type=str, default='configs/ml.yaml', help='Config file')
    parser.add_argument('--no-walk-forward', action='store_true', help='Skip walk-forward validation')
    
    args = parser.parse_args()
    
    # Initialize trainer
    trainer = MLTrainer(args.config)
    
    # Train model
    results = trainer.train(
        symbol=args.symbol,
        timeframe=args.timeframe,
        start_date=args.start_date,
        end_date=args.end_date,
        walk_forward=not args.no_walk_forward
    )
    
    # Print results
    print(f"Training completed for {args.symbol} {args.timeframe}")
    print(f"Model saved to: {results['model_path']}")
    print(f"Final accuracy: {results['final_results']['train_metrics']['accuracy']:.4f}")

if __name__ == "__main__":
    main()