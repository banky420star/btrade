"""
Structured logging with rotation and data integrity features.
"""
import logging
import logging.handlers
import json
import hashlib
from pathlib import Path
from typing import Any, Dict, Optional
from datetime import datetime
import structlog
from core.util.config import get_config

class DataIntegrityFilter(logging.Filter):
    """Filter to add data integrity checks to log records."""
    
    def filter(self, record):
        # Add checksum for critical log entries
        if hasattr(record, 'data') and isinstance(record.data, dict):
            record.data_checksum = self._calculate_checksum(record.data)
        return True
    
    def _calculate_checksum(self, data: Dict[str, Any]) -> str:
        """Calculate MD5 checksum of data dictionary."""
        data_str = json.dumps(data, sort_keys=True, default=str)
        return hashlib.md5(data_str.encode()).hexdigest()

class StructuredFormatter(logging.Formatter):
    """Custom formatter for structured logging."""
    
    def format(self, record):
        log_entry = {
            'timestamp': datetime.fromtimestamp(record.created).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno
        }
        
        # Add exception info if present
        if record.exc_info:
            log_entry['exception'] = self.formatException(record.exc_info)
        
        # Add extra fields
        for key, value in record.__dict__.items():
            if key not in ['name', 'msg', 'args', 'levelname', 'levelno', 'pathname', 
                          'filename', 'module', 'lineno', 'funcName', 'created', 
                          'msecs', 'relativeCreated', 'thread', 'threadName', 
                          'processName', 'process', 'getMessage', 'exc_info', 
                          'exc_text', 'stack_info']:
                log_entry[key] = value
        
        return json.dumps(log_entry, default=str)

def setup_logging(config: Optional[Any] = None) -> logging.Logger:
    """Setup structured logging with rotation and data integrity."""
    if config is None:
        config = get_config()
    
    # Create logs directory
    log_dir = Path(config.log_file).parent
    log_dir.mkdir(parents=True, exist_ok=True)
    
    # Configure structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )
    
    # Create main logger
    logger = logging.getLogger('sb1_alpha')
    logger.setLevel(getattr(logging, config.log_level.upper()))
    
    # Clear existing handlers
    logger.handlers.clear()
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    console_handler.setFormatter(console_formatter)
    logger.addHandler(console_handler)
    
    # File handler with rotation
    file_handler = logging.handlers.RotatingFileHandler(
        config.log_file,
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    file_handler.setLevel(logging.DEBUG)
    file_formatter = StructuredFormatter()
    file_handler.setFormatter(file_formatter)
    file_handler.addFilter(DataIntegrityFilter())
    logger.addHandler(file_handler)
    
    # Error file handler
    error_handler = logging.handlers.RotatingFileHandler(
        str(log_dir / 'error.log'),
        maxBytes=5*1024*1024,  # 5MB
        backupCount=3
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(file_formatter)
    error_handler.addFilter(DataIntegrityFilter())
    logger.addHandler(error_handler)
    
    # Trade-specific handler
    trade_handler = logging.handlers.RotatingFileHandler(
        str(log_dir / 'trades.csv'),
        maxBytes=50*1024*1024,  # 50MB
        backupCount=10
    )
    trade_handler.setLevel(logging.INFO)
    trade_formatter = logging.Formatter(
        '%(asctime)s,%(message)s'
    )
    trade_handler.setFormatter(trade_formatter)
    
    trade_logger = logging.getLogger('trades')
    trade_logger.setLevel(logging.INFO)
    trade_logger.addHandler(trade_handler)
    trade_logger.propagate = False
    
    return logger

def get_logger(name: str) -> logging.Logger:
    """Get a logger instance."""
    return logging.getLogger(f'sb1_alpha.{name}')

def log_trade(trade_data: Dict[str, Any]):
    """Log trade data with data integrity checks."""
    trade_logger = logging.getLogger('trades')
    
    # Validate trade data
    required_fields = ['id', 'symbol', 'side', 'size', 'price', 'timestamp']
    for field in required_fields:
        if field not in trade_data:
            raise ValueError(f"Missing required field: {field}")
    
    # Create trade log entry
    trade_entry = f"{trade_data['id']},{trade_data['symbol']},{trade_data['side']}," \
                 f"{trade_data['size']},{trade_data['price']},{trade_data['timestamp']}," \
                 f"{trade_data.get('pnl', '')},{trade_data.get('status', 'open')}"
    
    trade_logger.info(trade_entry)

def log_signal(signal_data: Dict[str, Any]):
    """Log signal data with data integrity checks."""
    signal_logger = get_logger('signals')
    
    # Validate signal data
    required_fields = ['id', 'symbol', 'signal', 'confidence', 'model', 'timestamp']
    for field in required_fields:
        if field not in signal_data:
            raise ValueError(f"Missing required field: {field}")
    
    signal_logger.info("Signal generated", data=signal_data)

def log_model_update(model_data: Dict[str, Any]):
    """Log model update with data integrity checks."""
    model_logger = get_logger('models')
    
    # Validate model data
    required_fields = ['name', 'accuracy', 'performance', 'status', 'timestamp']
    for field in required_fields:
        if field not in model_data:
            raise ValueError(f"Missing required field: {field}")
    
    model_logger.info("Model updated", data=model_data)

def log_data_integrity_check(check_data: Dict[str, Any]):
    """Log data integrity check results."""
    integrity_logger = get_logger('data_integrity')
    
    integrity_logger.info("Data integrity check", data=check_data)

# Initialize logging
logger = setup_logging()