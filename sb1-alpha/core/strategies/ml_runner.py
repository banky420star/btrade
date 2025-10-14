"""
ML strategy runner with data integrity validation and real-time execution.
"""
import argparse
import pandas as pd
import numpy as np
import time
import json
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta

from core.util.config import get_config
from core.util.logger import get_logger
from core.data.loaders import DataLoader
from core.ml.infer import MLInference
from core.adapters.paper.broker import PaperBroker
from core.adapters.bybit.broker import BybitBroker
from core.risk.position_sizing import PositionSizer
from core.risk.max_drawdown_guard import MaxDrawdownGuard

logger = get_logger(__name__)

class MLStrategyRunner:
    """ML strategy runner with data integrity validation and real-time execution."""
    
    def __init__(self, symbol: str, timeframe: str, 
                 model_path: str, broker: str = 'paper',
                 confidence_threshold: float = 0.6,
                 config: Optional[Any] = None):
        self.symbol = symbol
        self.timeframe = timeframe
        self.model_path = model_path
        self.broker = broker
        self.confidence_threshold = confidence_threshold
        self.config = config or get_config()
        
        # Initialize components
        self.data_loader = DataLoader()
        self.ml_inference = MLInference(model_path)
        self.position_sizer = PositionSizer()
        self.drawdown_guard = MaxDrawdownGuard()
        
        # Initialize broker
        if broker == 'paper':
            self.broker_client = PaperBroker()
        elif broker == 'bybit':
            self.broker_client = BybitBroker()
        else:
            raise ValueError(f"Unsupported broker: {broker}")
        
        # Strategy state
        self.is_running = False
        self.last_signal_time = None
        self.current_position = 0.0
        self.portfolio_value = 10000.0
        self.trades = []
        
        logger.info(f"ML strategy runner initialized: {symbol} {timeframe} with {broker} broker")
    
    def start(self):
        """Start the strategy runner."""
        if self.is_running:
            logger.warning("Strategy runner is already running")
            return
        
        self.is_running = True
        logger.info("Starting ML strategy runner")
        
        # Main trading loop
        while self.is_running:
            try:
                # Check if we should continue trading
                if not self._should_continue_trading():
                    logger.info("Stopping strategy due to risk limits")
                    break
                
                # Get latest data
                df = self._get_latest_data()
                
                if df.empty:
                    logger.warning("No data available, waiting...")
                    time.sleep(60)
                    continue
                
                # Generate signal
                signal = self._generate_signal(df)
                
                if signal is None:
                    logger.warning("Failed to generate signal")
                    time.sleep(60)
                    continue
                
                # Process signal
                self._process_signal(signal, df)
                
                # Wait before next iteration
                time.sleep(60)  # 1 minute
                
            except Exception as e:
                logger.error(f"Error in strategy loop: {e}")
                time.sleep(60)
    
    def stop(self):
        """Stop the strategy runner."""
        self.is_running = False
        logger.info("Stopping ML strategy runner")
    
    def _should_continue_trading(self) -> bool:
        """Check if we should continue trading based on risk limits."""
        # Check drawdown limits
        if not self.drawdown_guard.check_limits(self.portfolio_value):
            return False
        
        # Check if emergency stop is active
        if self.config.emergency_stop:
            return False
        
        return True
    
    def _get_latest_data(self) -> pd.DataFrame:
        """Get latest data for inference."""
        try:
            # Get recent data
            end_date = datetime.now().strftime('%Y-%m-%d')
            start_date = (datetime.now() - timedelta(days=7)).strftime('%Y-%m-%d')
            
            df = self.data_loader.load_historical_data(
                symbol=self.symbol,
                timeframe=self.timeframe,
                start_date=start_date,
                end_date=end_date
            )
            
            # Validate data
            self._validate_data(df)
            
            return df
            
        except Exception as e:
            logger.error(f"Failed to get latest data: {e}")
            return pd.DataFrame()
    
    def _validate_data(self, df: pd.DataFrame):
        """Validate data integrity."""
        if df.empty:
            raise ValueError("Data is empty")
        
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
    
    def _generate_signal(self, df: pd.DataFrame) -> Optional[Dict[str, Any]]:
        """Generate trading signal using ML model."""
        try:
            # Generate signal
            signal = self.ml_inference.generate_signal(df, self.confidence_threshold)
            
            # Validate signal
            self._validate_signal(signal)
            
            return signal
            
        except Exception as e:
            logger.error(f"Failed to generate signal: {e}")
            return None
    
    def _validate_signal(self, signal: Dict[str, Any]):
        """Validate signal data integrity."""
        required_fields = ['id', 'symbol', 'signal', 'confidence', 'model', 'timestamp']
        for field in required_fields:
            if field not in signal:
                raise ValueError(f"Missing required field: {field}")
        
        if signal['signal'] not in ['buy', 'sell', 'hold']:
            raise ValueError("Invalid signal type")
        
        if not (0 <= signal['confidence'] <= 1):
            raise ValueError("Confidence must be between 0 and 1")
    
    def _process_signal(self, signal: Dict[str, Any], df: pd.DataFrame):
        """Process trading signal and execute trades."""
        try:
            # Check if signal is new
            if self.last_signal_time and signal['timestamp'] <= self.last_signal_time:
                return
            
            self.last_signal_time = signal['timestamp']
            
            # Process based on signal type
            if signal['signal'] == 'buy':
                self._execute_buy_signal(signal, df)
            elif signal['signal'] == 'sell':
                self._execute_sell_signal(signal, df)
            elif signal['signal'] == 'hold':
                self._execute_hold_signal(signal, df)
            
            # Update portfolio value
            self._update_portfolio_value(df)
            
        except Exception as e:
            logger.error(f"Failed to process signal: {e}")
    
    def _execute_buy_signal(self, signal: Dict[str, Any], df: pd.DataFrame):
        """Execute buy signal."""
        if self.current_position >= 0:  # Not already long
            # Calculate position size
            position_size = self.position_sizer.calculate_size(
                signal['confidence'], 
                self.portfolio_value,
                self.config.risk_per_trade
            )
            
            if position_size > 0:
                # Execute trade
                trade_result = self.broker_client.place_order(
                    symbol=self.symbol,
                    side='buy',
                    size=position_size,
                    price=signal['price']
                )
                
                if trade_result['success']:
                    self.current_position += position_size
                    self._log_trade('buy', position_size, signal['price'], trade_result)
                    logger.info(f"Buy order executed: {position_size} at {signal['price']}")
                else:
                    logger.error(f"Buy order failed: {trade_result['error']}")
    
    def _execute_sell_signal(self, signal: Dict[str, Any], df: pd.DataFrame):
        """Execute sell signal."""
        if self.current_position > 0:  # Have long position
            # Calculate position size to close
            position_size = min(self.current_position, 
                              self.position_sizer.calculate_size(
                                  signal['confidence'], 
                                  self.portfolio_value,
                                  self.config.risk_per_trade
                              ))
            
            if position_size > 0:
                # Execute trade
                trade_result = self.broker_client.place_order(
                    symbol=self.symbol,
                    side='sell',
                    size=position_size,
                    price=signal['price']
                )
                
                if trade_result['success']:
                    self.current_position -= position_size
                    self._log_trade('sell', position_size, signal['price'], trade_result)
                    logger.info(f"Sell order executed: {position_size} at {signal['price']}")
                else:
                    logger.error(f"Sell order failed: {trade_result['error']}")
    
    def _execute_hold_signal(self, signal: Dict[str, Any], df: pd.DataFrame):
        """Execute hold signal."""
        # No action needed for hold signal
        logger.debug(f"Hold signal received: {signal['confidence']:.3f}")
    
    def _log_trade(self, side: str, size: float, price: float, trade_result: Dict[str, Any]):
        """Log trade with data integrity validation."""
        trade_data = {
            'id': trade_result.get('id', f"trade_{int(time.time() * 1000)}"),
            'symbol': self.symbol,
            'side': side,
            'size': size,
            'price': price,
            'timestamp': datetime.now().isoformat(),
            'broker': self.broker,
            'status': 'filled' if trade_result['success'] else 'failed',
            'error': trade_result.get('error', '')
        }
        
        # Validate trade data
        self._validate_trade_data(trade_data)
        
        # Log trade
        from core.util.logger import log_trade
        log_trade(trade_data)
        
        # Store trade
        self.trades.append(trade_data)
    
    def _validate_trade_data(self, trade_data: Dict[str, Any]):
        """Validate trade data integrity."""
        required_fields = ['id', 'symbol', 'side', 'size', 'price', 'timestamp']
        for field in required_fields:
            if field not in trade_data:
                raise ValueError(f"Missing required field: {field}")
        
        if trade_data['side'] not in ['buy', 'sell']:
            raise ValueError("Invalid trade side")
        
        if trade_data['size'] <= 0:
            raise ValueError("Trade size must be positive")
        
        if trade_data['price'] <= 0:
            raise ValueError("Trade price must be positive")
    
    def _update_portfolio_value(self, df: pd.DataFrame):
        """Update portfolio value."""
        if not df.empty:
            current_price = df['close'].iloc[-1]
            self.portfolio_value = self.broker_client.get_balance() + self.current_position * current_price
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get strategy performance metrics."""
        if not self.trades:
            return {}
        
        # Calculate metrics
        total_trades = len(self.trades)
        winning_trades = sum(1 for trade in self.trades if trade['status'] == 'filled')
        win_rate = winning_trades / total_trades if total_trades > 0 else 0
        
        # Calculate P&L (simplified)
        total_pnl = 0.0
        for trade in self.trades:
            if trade['status'] == 'filled':
                if trade['side'] == 'buy':
                    total_pnl -= trade['size'] * trade['price']
                elif trade['side'] == 'sell':
                    total_pnl += trade['size'] * trade['price']
        
        return {
            'total_trades': total_trades,
            'winning_trades': winning_trades,
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'portfolio_value': self.portfolio_value,
            'current_position': self.current_position,
            'last_signal_time': self.last_signal_time
        }

def main():
    """Main ML strategy runner script."""
    parser = argparse.ArgumentParser(description='Run ML strategy')
    parser.add_argument('--symbol', type=str, default='XAUUSD', help='Trading symbol')
    parser.add_argument('--timeframe', type=str, default='1h', help='Timeframe')
    parser.add_argument('--model-path', type=str, required=True, help='Path to trained model')
    parser.add_argument('--broker', type=str, default='paper', help='Broker (paper/bybit)')
    parser.add_argument('--confidence-threshold', type=float, default=0.6, help='Confidence threshold')
    
    args = parser.parse_args()
    
    # Initialize strategy runner
    runner = MLStrategyRunner(
        symbol=args.symbol,
        timeframe=args.timeframe,
        model_path=args.model_path,
        broker=args.broker,
        confidence_threshold=args.confidence_threshold
    )
    
    try:
        # Start strategy
        runner.start()
    except KeyboardInterrupt:
        logger.info("Strategy stopped by user")
    finally:
        # Stop strategy
        runner.stop()
        
        # Print performance metrics
        metrics = runner.get_performance_metrics()
        print(f"Strategy performance: {metrics}")

if __name__ == "__main__":
    main()