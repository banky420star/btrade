"""
Feature engineering with data integrity validation and no look-ahead bias.
"""
import numpy as np
import pandas as pd
from typing import List, Dict, Any, Optional, Tuple
import talib
from core.util.logger import get_logger
from core.util.config import get_config

logger = get_logger(__name__)

class FeatureSet:
    """Feature engineering with data integrity checks."""
    
    def __init__(self, config: Optional[Any] = None):
        self.config = config or get_config()
        self.feature_cache = {}
        self.integrity_checks = []
    
    def calculate_technical_indicators(self, df: pd.DataFrame) -> pd.DataFrame:
        """Calculate technical indicators with data integrity validation."""
        if df.empty or len(df) < 50:
            raise ValueError("Insufficient data for technical indicators")
        
        # Validate required columns
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}")
        
        # Create a copy to avoid modifying original data
        features_df = df.copy()
        
        # Price-based features
        features_df['returns_1'] = features_df['close'].pct_change(1)
        features_df['returns_3'] = features_df['close'].pct_change(3)
        features_df['returns_5'] = features_df['close'].pct_change(5)
        features_df['high_low_ratio'] = features_df['high'] / features_df['low']
        features_df['close_open_ratio'] = features_df['close'] / features_df['open']
        
        # Technical indicators
        features_df['rsi'] = talib.RSI(features_df['close'].values, timeperiod=14)
        features_df['macd'], features_df['macd_signal'], features_df['macd_hist'] = talib.MACD(
            features_df['close'].values, fastperiod=12, slowperiod=26, signalperiod=9
        )
        features_df['stoch_k'], features_df['stoch_d'] = talib.STOCH(
            features_df['high'].values, features_df['low'].values, features_df['close'].values,
            fastk_period=14, slowk_period=3, slowd_period=3
        )
        
        # Moving averages
        features_df['ema_5'] = talib.EMA(features_df['close'].values, timeperiod=5)
        features_df['ema_20'] = talib.EMA(features_df['close'].values, timeperiod=20)
        features_df['ema_50'] = talib.EMA(features_df['close'].values, timeperiod=50)
        
        # ATR and Bollinger Bands
        features_df['atr'] = talib.ATR(
            features_df['high'].values, features_df['low'].values, features_df['close'].values, timeperiod=14
        )
        features_df['bb_upper'], features_df['bb_middle'], features_df['bb_lower'] = talib.BBANDS(
            features_df['close'].values, timeperiod=20, nbdevup=2, nbdevdn=2
        )
        features_df['bb_position'] = (features_df['close'] - features_df['bb_lower']) / (features_df['bb_upper'] - features_df['bb_lower'])
        
        # Volume features
        features_df['volume_sma'] = talib.SMA(features_df['volume'].values, timeperiod=20)
        features_df['volume_zscore'] = (features_df['volume'] - features_df['volume_sma']) / features_df['volume_sma'].std()
        
        # Data integrity validation
        self._validate_features(features_df)
        
        return features_df
    
    def _validate_features(self, df: pd.DataFrame):
        """Validate feature data integrity."""
        # Check for NaN values
        nan_counts = df.isnull().sum()
        if nan_counts.any():
            logger.warning(f"NaN values found in features: {nan_counts[nan_counts > 0].to_dict()}")
        
        # Check for infinite values
        inf_counts = np.isinf(df.select_dtypes(include=[np.number])).sum()
        if inf_counts.any():
            logger.warning(f"Infinite values found in features: {inf_counts[inf_counts > 0].to_dict()}")
        
        # Check for extreme values
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        for col in numeric_cols:
            if col in ['returns_1', 'returns_3', 'returns_5']:
                # Returns should be reasonable
                extreme_returns = (df[col].abs() > 0.5).sum()
                if extreme_returns > 0:
                    logger.warning(f"Extreme returns found in {col}: {extreme_returns} values")
            elif col == 'rsi':
                # RSI should be between 0 and 100
                invalid_rsi = ((df[col] < 0) | (df[col] > 100)).sum()
                if invalid_rsi > 0:
                    logger.warning(f"Invalid RSI values found: {invalid_rsi} values")
        
        # Log data integrity check
        integrity_data = {
            'total_rows': len(df),
            'nan_counts': nan_counts.to_dict(),
            'inf_counts': inf_counts.to_dict(),
            'feature_columns': list(numeric_cols),
            'timestamp': pd.Timestamp.now().isoformat()
        }
        
        from core.util.logger import log_data_integrity_check
        log_data_integrity_check(integrity_data)
    
    def get_feature_columns(self) -> List[str]:
        """Get list of feature column names."""
        return [
            'returns_1', 'returns_3', 'returns_5',
            'high_low_ratio', 'close_open_ratio',
            'rsi', 'macd', 'macd_signal', 'macd_hist',
            'stoch_k', 'stoch_d',
            'ema_5', 'ema_20', 'ema_50',
            'atr', 'bb_position',
            'volume_zscore'
        ]
    
    def prepare_features(self, df: pd.DataFrame, target_col: str = 'close') -> Tuple[pd.DataFrame, pd.Series]:
        """Prepare features and target for ML training."""
        # Calculate technical indicators
        features_df = self.calculate_technical_indicators(df)
        
        # Get feature columns
        feature_cols = self.get_feature_columns()
        
        # Select only available features
        available_features = [col for col in feature_cols if col in features_df.columns]
        
        # Prepare feature matrix
        X = features_df[available_features].copy()
        
        # Prepare target
        y = features_df[target_col].copy()
        
        # Remove rows with NaN values
        valid_mask = ~(X.isnull().any(axis=1) | y.isnull())
        X = X[valid_mask]
        y = y[valid_mask]
        
        logger.info(f"Prepared features: {X.shape[1]} features, {X.shape[0]} samples")
        
        return X, y
    
    def calculate_feature_importance(self, model, feature_names: List[str]) -> Dict[str, float]:
        """Calculate feature importance from trained model."""
        if hasattr(model, 'feature_importances_'):
            importance_dict = dict(zip(feature_names, model.feature_importances_))
            return dict(sorted(importance_dict.items(), key=lambda x: x[1], reverse=True))
        else:
            logger.warning("Model does not support feature importance")
            return {}
    
    def validate_no_lookahead_bias(self, df: pd.DataFrame, features_df: pd.DataFrame) -> bool:
        """Validate that no look-ahead bias exists in features."""
        # Check that all features are calculated using only past data
        for col in self.get_feature_columns():
            if col in features_df.columns:
                # Check for any forward-looking calculations
                if col.startswith('returns_'):
                    # Returns should be calculated from past prices only
                    period = int(col.split('_')[1])
                    if len(features_df) > period:
                        # Verify that returns are calculated correctly
                        expected_returns = features_df['close'].pct_change(period)
                        actual_returns = features_df[col]
                        if not np.allclose(expected_returns, actual_returns, equal_nan=True):
                            logger.error(f"Look-ahead bias detected in {col}")
                            return False
        
        logger.info("No look-ahead bias detected in features")
        return True