"""
Data loaders with data integrity validation and caching.
"""
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime, timedelta
import ccxt
import yfinance as yf
import hashlib
import json
from pathlib import Path
import time

from core.util.config import get_config
from core.util.logger import get_logger

logger = get_logger(__name__)

class DataLoader:
    """Data loader with data integrity validation and caching."""
    
    def __init__(self, config: Optional[Any] = None):
        self.config = config or get_config()
        self.cache_dir = Path(self.config.cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        
        # Initialize exchanges
        self.exchanges = {
            'bybit': ccxt.bybit({
                'apiKey': self.config.bybit_key,
                'secret': self.config.bybit_secret,
                'sandbox': self.config.bybit_testnet,
                'enableRateLimit': True
            }) if self.config.bybit_key else None,
            'binance': ccxt.binance({
                'enableRateLimit': True
            }),
            'yahoo': yf
        }
    
    def load_historical_data(self, symbol: str, timeframe: str, 
                           start_date: str, end_date: str,
                           source: str = 'bybit') -> pd.DataFrame:
        """Load historical data with data integrity validation."""
        logger.info(f"Loading historical data: {symbol} {timeframe} from {start_date} to {end_date}")
        
        # Check cache first
        cache_key = self._generate_cache_key(symbol, timeframe, start_date, end_date, source)
        cached_data = self._load_from_cache(cache_key)
        
        if cached_data is not None:
            logger.info("Using cached data")
            return cached_data
        
        # Load data from source
        if source == 'bybit':
            df = self._load_from_bybit(symbol, timeframe, start_date, end_date)
        elif source == 'binance':
            df = self._load_from_binance(symbol, timeframe, start_date, end_date)
        elif source == 'yahoo':
            df = self._load_from_yahoo(symbol, timeframe, start_date, end_date)
        else:
            raise ValueError(f"Unsupported data source: {source}")
        
        # Validate data integrity
        self._validate_data_integrity(df, symbol, timeframe)
        
        # Cache data
        self._save_to_cache(cache_key, df)
        
        logger.info(f"Loaded {len(df)} data points")
        return df
    
    def _generate_cache_key(self, symbol: str, timeframe: str, 
                          start_date: str, end_date: str, source: str) -> str:
        """Generate cache key for data."""
        key_string = f"{symbol}_{timeframe}_{start_date}_{end_date}_{source}"
        return hashlib.md5(key_string.encode()).hexdigest()
    
    def _load_from_cache(self, cache_key: str) -> Optional[pd.DataFrame]:
        """Load data from cache."""
        cache_file = self.cache_dir / f"{cache_key}.parquet"
        
        if cache_file.exists():
            try:
                df = pd.read_parquet(cache_file)
                # Check if cache is still valid (1 hour)
                if time.time() - cache_file.stat().st_mtime < 3600:
                    return df
            except Exception as e:
                logger.warning(f"Failed to load from cache: {e}")
        
        return None
    
    def _save_to_cache(self, cache_key: str, df: pd.DataFrame):
        """Save data to cache."""
        cache_file = self.cache_dir / f"{cache_key}.parquet"
        
        try:
            df.to_parquet(cache_file)
            logger.info(f"Data cached to {cache_file}")
        except Exception as e:
            logger.warning(f"Failed to save to cache: {e}")
    
    def _load_from_bybit(self, symbol: str, timeframe: str, 
                        start_date: str, end_date: str) -> pd.DataFrame:
        """Load data from Bybit."""
        if self.exchanges['bybit'] is None:
            raise ValueError("Bybit not configured")
        
        exchange = self.exchanges['bybit']
        
        # Convert timeframe
        timeframe_map = {
            '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
            '1h': '1h', '4h': '4h', '1d': '1d'
        }
        
        if timeframe not in timeframe_map:
            raise ValueError(f"Unsupported timeframe: {timeframe}")
        
        # Convert dates
        start_ts = int(pd.Timestamp(start_date).timestamp() * 1000)
        end_ts = int(pd.Timestamp(end_date).timestamp() * 1000)
        
        # Fetch data
        ohlcv = exchange.fetch_ohlcv(symbol, timeframe_map[timeframe], since=start_ts, limit=1000)
        
        # Convert to DataFrame
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        return df
    
    def _load_from_binance(self, symbol: str, timeframe: str, 
                          start_date: str, end_date: str) -> pd.DataFrame:
        """Load data from Binance."""
        exchange = self.exchanges['binance']
        
        # Convert timeframe
        timeframe_map = {
            '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
            '1h': '1h', '4h': '4h', '1d': '1d'
        }
        
        if timeframe not in timeframe_map:
            raise ValueError(f"Unsupported timeframe: {timeframe}")
        
        # Convert dates
        start_ts = int(pd.Timestamp(start_date).timestamp() * 1000)
        end_ts = int(pd.Timestamp(end_date).timestamp() * 1000)
        
        # Fetch data
        ohlcv = exchange.fetch_ohlcv(symbol, timeframe_map[timeframe], since=start_ts, limit=1000)
        
        # Convert to DataFrame
        df = pd.DataFrame(ohlcv, columns=['timestamp', 'open', 'high', 'low', 'close', 'volume'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], unit='ms')
        df.set_index('timestamp', inplace=True)
        
        return df
    
    def _load_from_yahoo(self, symbol: str, timeframe: str, 
                        start_date: str, end_date: str) -> pd.DataFrame:
        """Load data from Yahoo Finance."""
        yf_symbol = symbol.replace('/', '-')
        
        # Convert timeframe
        interval_map = {
            '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
            '1h': '1h', '4h': '4h', '1d': '1d'
        }
        
        if timeframe not in interval_map:
            raise ValueError(f"Unsupported timeframe: {timeframe}")
        
        # Fetch data
        ticker = yf.Ticker(yf_symbol)
        df = ticker.history(start=start_date, end=end_date, interval=interval_map[timeframe])
        
        # Rename columns to match expected format
        df.columns = df.columns.str.lower()
        
        return df
    
    def _validate_data_integrity(self, df: pd.DataFrame, symbol: str, timeframe: str):
        """Validate data integrity."""
        # Check if data is empty
        if df.empty:
            raise ValueError("No data loaded")
        
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
        
        # Check for negative prices
        price_cols = ['open', 'high', 'low', 'close']
        for col in price_cols:
            if (df[col] <= 0).any():
                logger.warning(f"Non-positive prices found in {col}")
        
        # Check for negative volume
        if (df['volume'] < 0).any():
            logger.warning("Negative volume found")
        
        # Check OHLC relationships
        invalid_ohlc = (df['high'] < df['low']) | (df['high'] < df['open']) | (df['high'] < df['close']) | \
                      (df['low'] > df['open']) | (df['low'] > df['close'])
        
        if invalid_ohlc.any():
            logger.warning(f"Invalid OHLC relationships found: {invalid_ohlc.sum()}")
        
        # Check for duplicate timestamps
        if df.index.duplicated().any():
            logger.warning("Duplicate timestamps found")
        
        # Check for gaps in data
        if hasattr(df.index, 'to_pydatetime'):
            time_diffs = df.index.to_series().diff()
            expected_freq = pd.Timedelta(hours=1) if '1h' in timeframe else pd.Timedelta(minutes=1)
            large_gaps = time_diffs > expected_freq * 2
            if large_gaps.any():
                logger.warning(f"Large time gaps found: {large_gaps.sum()}")
        
        # Log data integrity check
        integrity_data = {
            'symbol': symbol,
            'timeframe': timeframe,
            'total_rows': len(df),
            'date_range': {
                'start': str(df.index.min()),
                'end': str(df.index.max())
            },
            'nan_counts': nan_counts.to_dict(),
            'inf_counts': inf_counts.to_dict(),
            'price_stats': {
                'min_price': df['close'].min(),
                'max_price': df['close'].max(),
                'mean_price': df['close'].mean()
            },
            'volume_stats': {
                'min_volume': df['volume'].min(),
                'max_volume': df['volume'].max(),
                'mean_volume': df['volume'].mean()
            },
            'timestamp': datetime.now().isoformat()
        }
        
        from core.util.logger import log_data_integrity_check
        log_data_integrity_check(integrity_data)
        
        logger.info("Data integrity validation passed")
    
    def get_latest_data(self, symbol: str, timeframe: str, 
                       limit: int = 100) -> pd.DataFrame:
        """Get latest data for real-time inference."""
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
        
        df = self.load_historical_data(symbol, timeframe, start_date, end_date)
        
        # Return only the latest data
        return df.tail(limit)
    
    def validate_data_quality(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Validate data quality and return metrics."""
        quality_metrics = {
            'total_rows': len(df),
            'date_range': {
                'start': str(df.index.min()),
                'end': str(df.index.max())
            },
            'missing_data': df.isnull().sum().to_dict(),
            'infinite_data': np.isinf(df.select_dtypes(include=[np.number])).sum().to_dict(),
            'price_range': {
                'min': df['close'].min(),
                'max': df['close'].max(),
                'mean': df['close'].mean(),
                'std': df['close'].std()
            },
            'volume_range': {
                'min': df['volume'].min(),
                'max': df['volume'].max(),
                'mean': df['volume'].mean(),
                'std': df['volume'].std()
            },
            'duplicate_timestamps': df.index.duplicated().sum(),
            'timestamp': datetime.now().isoformat()
        }
        
        return quality_metrics