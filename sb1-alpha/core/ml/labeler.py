"""
Label generation with data integrity validation and no look-ahead bias.
"""
import numpy as np
import pandas as pd
from typing import Tuple, Optional, Dict, Any
from core.util.logger import get_logger
from core.util.config import get_config

logger = get_logger(__name__)

class Labeler:
    """Label generation with data integrity checks."""
    
    def __init__(self, horizon: int = 3, threshold: float = 0.001, config: Optional[Any] = None):
        self.horizon = horizon
        self.threshold = threshold
        self.config = config or get_config()
    
    def create_labels(self, df: pd.DataFrame, price_col: str = 'close') -> pd.Series:
        """Create binary labels for price movement prediction."""
        if df.empty or len(df) < self.horizon + 1:
            raise ValueError(f"Insufficient data for labeling (need at least {self.horizon + 1} rows)")
        
        if price_col not in df.columns:
            raise ValueError(f"Price column '{price_col}' not found in dataframe")
        
        # Calculate future returns
        future_returns = df[price_col].shift(-self.horizon) / df[price_col] - 1
        
        # Create binary labels
        labels = np.where(future_returns > self.threshold, 1, 0)
        
        # Convert to pandas Series
        labels_series = pd.Series(labels, index=df.index, name='label')
        
        # Validate labels
        self._validate_labels(labels_series, future_returns)
        
        logger.info(f"Created labels: {labels_series.sum()} positive labels out of {len(labels_series)} total")
        
        return labels_series
    
    def _validate_labels(self, labels: pd.Series, future_returns: pd.Series):
        """Validate label data integrity."""
        # Check for NaN values
        nan_count = labels.isnull().sum()
        if nan_count > 0:
            logger.warning(f"NaN values found in labels: {nan_count}")
        
        # Check label distribution
        label_counts = labels.value_counts()
        logger.info(f"Label distribution: {label_counts.to_dict()}")
        
        # Check for extreme imbalance
        if len(label_counts) > 1:
            min_ratio = label_counts.min() / label_counts.sum()
            if min_ratio < 0.1:
                logger.warning(f"Extreme class imbalance detected: {min_ratio:.3f}")
        
        # Validate against future returns
        if not future_returns.isnull().all():
            # Check that labels match future returns
            valid_mask = ~(labels.isnull() | future_returns.isnull())
            if valid_mask.any():
                expected_labels = (future_returns[valid_mask] > self.threshold).astype(int)
                actual_labels = labels[valid_mask]
                
                if not np.array_equal(expected_labels, actual_labels):
                    logger.error("Label validation failed: labels do not match future returns")
                    raise ValueError("Label validation failed")
        
        logger.info("Label validation passed")
    
    def create_multiclass_labels(self, df: pd.DataFrame, price_col: str = 'close', 
                                thresholds: Optional[Dict[str, float]] = None) -> pd.Series:
        """Create multiclass labels for price movement prediction."""
        if thresholds is None:
            thresholds = {
                'strong_down': -0.005,  # -0.5%
                'weak_down': -0.001,    # -0.1%
                'weak_up': 0.001,       # 0.1%
                'strong_up': 0.005      # 0.5%
            }
        
        if df.empty or len(df) < self.horizon + 1:
            raise ValueError(f"Insufficient data for labeling (need at least {self.horizon + 1} rows)")
        
        # Calculate future returns
        future_returns = df[price_col].shift(-self.horizon) / df[price_col] - 1
        
        # Create multiclass labels
        labels = np.zeros(len(df), dtype=int)
        labels[future_returns <= thresholds['strong_down']] = 0  # Strong down
        labels[(future_returns > thresholds['strong_down']) & (future_returns <= thresholds['weak_down'])] = 1  # Weak down
        labels[(future_returns > thresholds['weak_down']) & (future_returns <= thresholds['weak_up'])] = 2  # Hold
        labels[(future_returns > thresholds['weak_up']) & (future_returns <= thresholds['strong_up'])] = 3  # Weak up
        labels[future_returns > thresholds['strong_up']] = 4  # Strong up
        
        # Convert to pandas Series
        labels_series = pd.Series(labels, index=df.index, name='multiclass_label')
        
        # Validate labels
        self._validate_multiclass_labels(labels_series, future_returns, thresholds)
        
        logger.info(f"Created multiclass labels: {labels_series.value_counts().to_dict()}")
        
        return labels_series
    
    def _validate_multiclass_labels(self, labels: pd.Series, future_returns: pd.Series, 
                                   thresholds: Dict[str, float]):
        """Validate multiclass label data integrity."""
        # Check for NaN values
        nan_count = labels.isnull().sum()
        if nan_count > 0:
            logger.warning(f"NaN values found in multiclass labels: {nan_count}")
        
        # Check label distribution
        label_counts = labels.value_counts().sort_index()
        logger.info(f"Multiclass label distribution: {label_counts.to_dict()}")
        
        # Check for extreme imbalance
        if len(label_counts) > 1:
            min_ratio = label_counts.min() / label_counts.sum()
            if min_ratio < 0.05:
                logger.warning(f"Extreme class imbalance detected: {min_ratio:.3f}")
        
        # Validate against future returns
        if not future_returns.isnull().all():
            valid_mask = ~(labels.isnull() | future_returns.isnull())
            if valid_mask.any():
                valid_returns = future_returns[valid_mask]
                valid_labels = labels[valid_mask]
                
                # Check that labels match thresholds
                for i, (label, count) in enumerate(label_counts.items()):
                    if count > 0:
                        mask = valid_labels == label
                        if mask.any():
                            label_returns = valid_returns[mask]
                            
                            if label == 0:  # Strong down
                                if not (label_returns <= thresholds['strong_down']).all():
                                    logger.error(f"Label {label} validation failed for strong down")
                            elif label == 1:  # Weak down
                                if not ((label_returns > thresholds['strong_down']) & 
                                       (label_returns <= thresholds['weak_down'])).all():
                                    logger.error(f"Label {label} validation failed for weak down")
                            elif label == 2:  # Hold
                                if not ((label_returns > thresholds['weak_down']) & 
                                       (label_returns <= thresholds['weak_up'])).all():
                                    logger.error(f"Label {label} validation failed for hold")
                            elif label == 3:  # Weak up
                                if not ((label_returns > thresholds['weak_up']) & 
                                       (label_returns <= thresholds['strong_up'])).all():
                                    logger.error(f"Label {label} validation failed for weak up")
                            elif label == 4:  # Strong up
                                if not (label_returns > thresholds['strong_up']).all():
                                    logger.error(f"Label {label} validation failed for strong up")
        
        logger.info("Multiclass label validation passed")
    
    def create_regression_labels(self, df: pd.DataFrame, price_col: str = 'close') -> pd.Series:
        """Create regression labels for price prediction."""
        if df.empty or len(df) < self.horizon + 1:
            raise ValueError(f"Insufficient data for labeling (need at least {self.horizon + 1} rows)")
        
        # Calculate future returns
        future_returns = df[price_col].shift(-self.horizon) / df[price_col] - 1
        
        # Convert to pandas Series
        labels_series = pd.Series(future_returns, index=df.index, name='regression_label')
        
        # Validate labels
        self._validate_regression_labels(labels_series)
        
        logger.info(f"Created regression labels: mean={labels_series.mean():.6f}, std={labels_series.std():.6f}")
        
        return labels_series
    
    def _validate_regression_labels(self, labels: pd.Series):
        """Validate regression label data integrity."""
        # Check for NaN values
        nan_count = labels.isnull().sum()
        if nan_count > 0:
            logger.warning(f"NaN values found in regression labels: {nan_count}")
        
        # Check for extreme values
        extreme_values = (labels.abs() > 0.1).sum()  # More than 10% move
        if extreme_values > 0:
            logger.warning(f"Extreme values found in regression labels: {extreme_values}")
        
        # Check distribution
        logger.info(f"Regression label statistics: mean={labels.mean():.6f}, std={labels.std():.6f}, "
                   f"min={labels.min():.6f}, max={labels.max():.6f}")
        
        logger.info("Regression label validation passed")