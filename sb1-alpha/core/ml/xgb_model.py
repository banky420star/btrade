"""
XGBoost model with data integrity validation and calibration.
"""
import numpy as np
import pandas as pd
from typing import Tuple, Optional, Dict, Any, List
import xgboost as xgb
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, roc_auc_score
from sklearn.calibration import CalibratedClassifierCV
import joblib
import json
from pathlib import Path
from core.util.logger import get_logger
from core.util.config import get_config

logger = get_logger(__name__)

class XGBModel:
    """XGBoost model with data integrity validation and calibration."""
    
    def __init__(self, config: Optional[Dict[str, Any]] = None):
        self.config = config or {
            'n_estimators': 100,
            'max_depth': 6,
            'learning_rate': 0.1,
            'subsample': 0.8,
            'colsample_bytree': 0.8,
            'tree_method': 'hist',
            'random_state': 42
        }
        self.model = None
        self.calibrator = None
        self.feature_names = None
        self.training_metadata = {}
    
    def train(self, X: pd.DataFrame, y: pd.Series, 
              validation_split: float = 0.2, 
              calibrate: bool = True) -> Dict[str, Any]:
        """Train XGBoost model with data integrity validation."""
        # Validate inputs
        self._validate_training_data(X, y)
        
        # Split data
        X_train, X_val, y_train, y_val = train_test_split(
            X, y, test_size=validation_split, random_state=42, stratify=y
        )
        
        logger.info(f"Training data: {X_train.shape[0]} samples, {X_train.shape[1]} features")
        logger.info(f"Validation data: {X_val.shape[0]} samples")
        
        # Create and train model
        self.model = xgb.XGBClassifier(**self.config)
        self.model.fit(X_train, y_train)
        
        # Store feature names
        self.feature_names = list(X.columns)
        
        # Evaluate model
        train_metrics = self._evaluate_model(self.model, X_train, y_train)
        val_metrics = self._evaluate_model(self.model, X_val, y_val)
        
        logger.info(f"Training metrics: {train_metrics}")
        logger.info(f"Validation metrics: {val_metrics}")
        
        # Calibrate model if requested
        if calibrate:
            self.calibrator = CalibratedClassifierCV(self.model, method='isotonic', cv=3)
            self.calibrator.fit(X_train, y_train)
            
            # Evaluate calibrated model
            calib_val_metrics = self._evaluate_model(self.calibrator, X_val, y_val)
            logger.info(f"Calibrated validation metrics: {calib_val_metrics}")
        
        # Store training metadata
        self.training_metadata = {
            'training_samples': len(X_train),
            'validation_samples': len(X_val),
            'features': self.feature_names,
            'config': self.config,
            'train_metrics': train_metrics,
            'val_metrics': val_metrics,
            'calibrated': calibrate,
            'timestamp': pd.Timestamp.now().isoformat()
        }
        
        return {
            'train_metrics': train_metrics,
            'val_metrics': val_metrics,
            'calibrated': calibrate,
            'feature_importance': self.get_feature_importance()
        }
    
    def _validate_training_data(self, X: pd.DataFrame, y: pd.Series):
        """Validate training data integrity."""
        # Check data types
        if not isinstance(X, pd.DataFrame):
            raise ValueError("X must be a pandas DataFrame")
        if not isinstance(y, pd.Series):
            raise ValueError("y must be a pandas Series")
        
        # Check dimensions
        if len(X) != len(y):
            raise ValueError("X and y must have the same length")
        
        # Check for NaN values
        if X.isnull().any().any():
            raise ValueError("X contains NaN values")
        if y.isnull().any():
            raise ValueError("y contains NaN values")
        
        # Check for infinite values
        if np.isinf(X.select_dtypes(include=[np.number])).any().any():
            raise ValueError("X contains infinite values")
        if np.isinf(y).any():
            raise ValueError("y contains infinite values")
        
        # Check target distribution
        unique_labels = y.unique()
        if len(unique_labels) < 2:
            raise ValueError("y must have at least 2 unique labels")
        
        logger.info(f"Training data validation passed: {X.shape[0]} samples, {X.shape[1]} features")
    
    def _evaluate_model(self, model, X: pd.DataFrame, y: pd.Series) -> Dict[str, float]:
        """Evaluate model performance."""
        y_pred = model.predict(X)
        y_pred_proba = model.predict_proba(X)[:, 1] if hasattr(model, 'predict_proba') else None
        
        metrics = {
            'accuracy': accuracy_score(y, y_pred),
            'precision': precision_score(y, y_pred, average='weighted'),
            'recall': recall_score(y, y_pred, average='weighted'),
            'f1': f1_score(y, y_pred, average='weighted')
        }
        
        if y_pred_proba is not None:
            try:
                metrics['roc_auc'] = roc_auc_score(y, y_pred_proba)
            except ValueError:
                metrics['roc_auc'] = 0.0
        
        return metrics
    
    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Make predictions."""
        if self.model is None:
            raise ValueError("Model not trained")
        
        # Validate input
        self._validate_prediction_data(X)
        
        # Make predictions
        if self.calibrator is not None:
            return self.calibrator.predict(X)
        else:
            return self.model.predict(X)
    
    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Make probability predictions."""
        if self.model is None:
            raise ValueError("Model not trained")
        
        # Validate input
        self._validate_prediction_data(X)
        
        # Make predictions
        if self.calibrator is not None:
            return self.calibrator.predict_proba(X)
        else:
            return self.model.predict_proba(X)
    
    def _validate_prediction_data(self, X: pd.DataFrame):
        """Validate prediction data integrity."""
        # Check data type
        if not isinstance(X, pd.DataFrame):
            raise ValueError("X must be a pandas DataFrame")
        
        # Check feature names
        if self.feature_names is not None:
            missing_features = set(self.feature_names) - set(X.columns)
            if missing_features:
                raise ValueError(f"Missing features: {missing_features}")
        
        # Check for NaN values
        if X.isnull().any().any():
            raise ValueError("X contains NaN values")
        
        # Check for infinite values
        if np.isinf(X.select_dtypes(include=[np.number])).any().any():
            raise ValueError("X contains infinite values")
    
    def get_feature_importance(self) -> Dict[str, float]:
        """Get feature importance."""
        if self.model is None:
            raise ValueError("Model not trained")
        
        if self.feature_names is None:
            return {}
        
        importance_dict = dict(zip(self.feature_names, self.model.feature_importances_))
        return dict(sorted(importance_dict.items(), key=lambda x: x[1], reverse=True))
    
    def cross_validate(self, X: pd.DataFrame, y: pd.Series, cv: int = 5) -> Dict[str, float]:
        """Perform cross-validation."""
        if self.model is None:
            raise ValueError("Model not trained")
        
        # Create model for cross-validation
        cv_model = xgb.XGBClassifier(**self.config)
        
        # Perform cross-validation
        cv_scores = cross_val_score(cv_model, X, y, cv=cv, scoring='accuracy')
        
        return {
            'mean_accuracy': cv_scores.mean(),
            'std_accuracy': cv_scores.std(),
            'cv_scores': cv_scores.tolist()
        }
    
    def save_model(self, filepath: str):
        """Save model and metadata."""
        if self.model is None:
            raise ValueError("Model not trained")
        
        # Create directory if it doesn't exist
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        
        # Save model
        if self.calibrator is not None:
            joblib.dump(self.calibrator, filepath)
        else:
            joblib.dump(self.model, filepath)
        
        # Save metadata
        metadata_file = filepath.replace('.joblib', '_metadata.json')
        with open(metadata_file, 'w') as f:
            json.dump(self.training_metadata, f, indent=2)
        
        logger.info(f"Model saved to {filepath}")
    
    def load_model(self, filepath: str):
        """Load model and metadata."""
        if not Path(filepath).exists():
            raise FileNotFoundError(f"Model file not found: {filepath}")
        
        # Load model
        self.model = joblib.load(filepath)
        
        # Check if it's a calibrator
        if hasattr(self.model, 'calibrated_classifiers_'):
            self.calibrator = self.model
            self.model = self.model.base_estimator
        
        # Load metadata
        metadata_file = filepath.replace('.joblib', '_metadata.json')
        if Path(metadata_file).exists():
            with open(metadata_file, 'r') as f:
                self.training_metadata = json.load(f)
                self.feature_names = self.training_metadata.get('features', [])
        
        logger.info(f"Model loaded from {filepath}")
    
    def get_model_info(self) -> Dict[str, Any]:
        """Get model information."""
        if self.model is None:
            return {'status': 'not_trained'}
        
        return {
            'status': 'trained',
            'model_type': 'XGBoost',
            'calibrated': self.calibrator is not None,
            'features': self.feature_names,
            'training_metadata': self.training_metadata
        }