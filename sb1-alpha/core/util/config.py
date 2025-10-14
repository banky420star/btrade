"""
Configuration management with environment variable support and data integrity validation.
"""
import os
import yaml
from typing import Any, Dict, Optional, Union
from pathlib import Path
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

def load_dotenv(env_file: str):
    """Load environment variables from file."""
    try:
        from dotenv import load_dotenv as _load_dotenv
        _load_dotenv(env_file)
    except ImportError:
        # Fallback implementation
        if os.path.exists(env_file):
            with open(env_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        os.environ[key.strip()] = value.strip()

@dataclass
class Config:
    """Main configuration class with type safety and validation."""
    
    # Trading Configuration
    broker: str = "paper"
    symbol: str = "XAUUSD"
    timeframe: str = "1h"
    risk_per_trade: float = 0.01
    max_drawdown_pct: float = 0.2
    
    # Bybit Configuration
    bybit_key: str = ""
    bybit_secret: str = ""
    bybit_testnet: bool = True
    
    # Telegram Configuration
    telegram_bot_token: str = ""
    telegram_chat_id: str = ""
    
    # MT5 Bridge Configuration
    bridge_port: int = 5010
    mt5_bridge_host: str = "localhost"
    
    # ML/RL Configuration
    ml_retrain_hours: int = 24
    rl_epochs: int = 10
    rl_batch_size: int = 32
    rl_learning_rate: float = 0.001
    
    # Data Configuration
    data_source: str = "bybit"
    cache_dir: str = "./runtime/cache"
    model_dir: str = "./models"
    
    # Logging Configuration
    log_level: str = "INFO"
    log_file: str = "./logs/sb1_alpha.log"
    
    # API Configuration
    api_port: int = 3001
    api_host: str = "localhost"
    
    def __post_init__(self):
        """Validate configuration after initialization."""
        self._validate_config()
        self._ensure_directories()
    
    def _validate_config(self):
        """Validate configuration values."""
        if self.risk_per_trade <= 0 or self.risk_per_trade > 0.1:
            raise ValueError("risk_per_trade must be between 0 and 0.1")
        
        if self.max_drawdown_pct <= 0 or self.max_drawdown_pct > 1:
            raise ValueError("max_drawdown_pct must be between 0 and 1")
        
        if self.broker not in ["paper", "bybit", "mt5"]:
            raise ValueError("broker must be one of: paper, bybit, mt5")
        
        if self.timeframe not in ["1m", "5m", "15m", "30m", "1h", "4h", "1d"]:
            raise ValueError("Invalid timeframe")
    
    def _ensure_directories(self):
        """Ensure required directories exist."""
        directories = [
            self.cache_dir,
            self.model_dir,
            "./logs",
            "./runtime",
            "./models/registry",
            "./reports"
        ]
        
        for directory in directories:
            Path(directory).mkdir(parents=True, exist_ok=True)
    
    @classmethod
    def from_env(cls, env_file: Optional[str] = None) -> "Config":
        """Load configuration from environment variables."""
        if env_file:
            load_dotenv(env_file)
        
        return cls(
            broker=os.getenv("BROKER", "paper"),
            symbol=os.getenv("SYMBOL", "XAUUSD"),
            timeframe=os.getenv("TIMEFRAME", "1h"),
            risk_per_trade=float(os.getenv("RISK_PER_TRADE", "0.01")),
            max_drawdown_pct=float(os.getenv("MAX_DRAWDOWN_PCT", "0.2")),
            bybit_key=os.getenv("BYBIT_KEY", ""),
            bybit_secret=os.getenv("BYBIT_SECRET", ""),
            bybit_testnet=os.getenv("BYBIT_TESTNET", "true").lower() == "true",
            telegram_bot_token=os.getenv("TELEGRAM_BOT_TOKEN", ""),
            telegram_chat_id=os.getenv("TELEGRAM_CHAT_ID", ""),
            bridge_port=int(os.getenv("BRIDGE_PORT", "5010")),
            mt5_bridge_host=os.getenv("MT5_BRIDGE_HOST", "localhost"),
            ml_retrain_hours=int(os.getenv("ML_RETRAIN_HOURS", "24")),
            rl_epochs=int(os.getenv("RL_EPOCHS", "10")),
            rl_batch_size=int(os.getenv("RL_BATCH_SIZE", "32")),
            rl_learning_rate=float(os.getenv("RL_LEARNING_RATE", "0.001")),
            data_source=os.getenv("DATA_SOURCE", "bybit"),
            cache_dir=os.getenv("CACHE_DIR", "./runtime/cache"),
            model_dir=os.getenv("MODEL_DIR", "./models"),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
            log_file=os.getenv("LOG_FILE", "./logs/sb1_alpha.log"),
            api_port=int(os.getenv("API_PORT", "3001")),
            api_host=os.getenv("API_HOST", "localhost")
        )
    
    @classmethod
    def from_yaml(cls, yaml_file: str) -> "Config":
        """Load configuration from YAML file."""
        with open(yaml_file, 'r') as f:
            config_dict = yaml.safe_load(f)
        
        return cls(**config_dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert configuration to dictionary."""
        return {
            field.name: getattr(self, field.name)
            for field in self.__dataclass_fields__.values()
        }
    
    def save_to_yaml(self, yaml_file: str):
        """Save configuration to YAML file."""
        with open(yaml_file, 'w') as f:
            yaml.dump(self.to_dict(), f, default_flow_style=False)

# Global configuration instance
config = Config.from_env()

def get_config() -> Config:
    """Get the global configuration instance."""
    return config

def reload_config(env_file: Optional[str] = None) -> Config:
    """Reload configuration from environment."""
    global config
    config = Config.from_env(env_file)
    logger.info("Configuration reloaded")
    return config