"""
RL strategy runner with data integrity validation and real-time execution.
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
from core.rl.env import TradingEnvironment
from core.rl.ddqn import DoubleDQN
from core.adapters.paper.broker import PaperBroker
from core.adapters.bybit.broker import BybitBroker
from core.risk.position_sizing import PositionSizer
from core.risk.max_drawdown_guard import MaxDrawdownGuard

logger = get_logger(__name__)

class RLStrategyRunner:
    """RL strategy runner with data integrity validation and real-time execution."""
    
    def __init__(self, symbol: str, timeframe: str, 
                 model_path: str, broker: str = 'paper',
                 config: Optional[Any] = None):
        self.symbol = symbol
        self.timeframe = timeframe
        self.model_path = model_path
        self.broker = broker
        self.config = config or get_config()
        
        # Initialize components
        self.data_loader = DataLoader()
        self.position_sizer = PositionSizer()
        self.drawdown_guard = MaxDrawdownGuard()
        
        # Initialize broker
        if broker == 'paper':
            self.broker_client = PaperBroker()
        elif broker == 'bybit':
            self.broker_client = BybitBroker()
        else:
            raise ValueError(f"Unsupported broker: {broker}")
        
        # Load RL model
        self._load_rl_model()
        
        # Strategy state
        self.is_running = False
        self.last_signal_time = None
        self.current_position = 0.0
        self.portfolio_value = 10000.0
        self.trades = []
        
        logger.info(f"RL strategy runner initialized: {symbol} {timeframe} with {broker} broker")
    
    def _load_rl_model(self):
        """Load RL model with data integrity validation."""
        if not Path(self.model_path).exists():
            raise FileNotFoundError(f"RL model not found: {self.model_path}")
        
        # Create environment to get dimensions
        env_config = {
            'lookback': 50,
            'features': ['close', 'volume', 'rsi', 'macd', 'atr'],
            'action_space': 3,
            'reward_function': 'sharpe_ratio',
            'transaction_cost': 0.001,
            'max_position': 1.0
        }
        
        # Create dummy environment for dimensions
        dummy_data = pd.DataFrame({
            'open': [100] * 100,
            'high': [101] * 100,
            'low': [99] * 100,
            'close': [100] * 100,
            'volume': [1000] * 100
        })
        
        dummy_env = TradingEnvironment(dummy_data, env_config)
        
        # Initialize agent
        self.agent = DoubleDQN(
            state_size=dummy_env.observation_space.shape[0] * dummy_env.observation_space.shape[1],
            action_size=dummy_env.action_space.n
        )
        
        # Load trained model
        self.agent.load(self.model_path)
        
        logger.info(f"RL model loaded from {self.model_path}")
    
    def start(self):
        """Start the RL strategy runner."""
        if self.is_running:
            logger.warning("RL strategy runner is already running")
            return
        
        self.is_running = True
        logger.info("Starting RL strategy runner")
        
        # Main trading loop
        while self.is_running:
            try:
                # Check if we should continue trading
                if not self._should_continue_trading():
                    logger.info("Stopping RL strategy due to risk limits")
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
                    logger.warning("Failed to generate RL signal")
                    time.sleep(60)
                    continue
                
                # Process signal
                self._process_signal(signal, df)
                
                # Wait before next iteration
                time.sleep(60)  # 1 minute
                
            except Exception as e:
                logger.error(f"Error in RL strategy loop: {e}")
                time.sleep(60)
    
    def stop(self):
        """Stop the RL strategy runner."""
        self.is_running = False
        logger.info("Stopping RL strategy runner")
    
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
        """Get latest data for RL inference."""
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
            
            # Add technical indicators
            df = self._add_technical_indicators(df)
            
            # Validate data
            self._validate_data(df)
            
            return df
            
        except Exception as e:
            logger.error(f"Failed to get latest data: {e}")
            return pd.DataFrame()
    
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
    
    def _validate_data(self, df: pd.DataFrame):
        """Validate data integrity."""
        if df.empty:
            raise ValueError("Data is empty")
        
        # Check required columns
        required_cols = ['open', 'high', 'low', 'close', 'volume', 'rsi', 'macd', 'atr']
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
        """Generate trading signal using RL model."""
        try:
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
            
            # Get current state
            state = env.reset()
            
            # Get action from RL model
            action = self.agent.act(state, training=False)
            
            # Map action to signal
            if action == 0:  # Hold
                signal_type = 'hold'
                confidence = 0.5
            elif action == 1:  # Buy
                signal_type = 'buy'
                confidence = 0.8
            elif action == 2:  # Sell
                signal_type = 'sell'
                confidence = 0.8
            else:
                signal_type = 'hold'
                confidence = 0.5
            
            # Create signal
            signal = {
                'id': f"rl_signal_{int(time.time() * 1000)}",
                'symbol': self.symbol,
                'signal': signal_type,
                'confidence': confidence,
                'model': 'rl',
                'timestamp': datetime.now().isoformat(),
                'price': df['close'].iloc[-1],
                'metadata': {
                    'action': int(action),
                    'model_path': self.model_path
                }
            }
            
            # Validate signal
            self._validate_signal(signal)
            
            return signal
            
        except Exception as e:
            logger.error(f"Failed to generate RL signal: {e}")
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
            logger.error(f"Failed to process RL signal: {e}")
    
    def _execute_buy_signal(self, signal: Dict[str, Any], df: pd.DataFrame):
        """Execute buy signal."""
        if self.current_position <= 0:  # Not already long
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
                    logger.info(f"RL Buy order executed: {position_size} at {signal['price']}")
                else:
                    logger.error(f"RL Buy order failed: {trade_result['error']}")
    
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
                    logger.info(f"RL Sell order executed: {position_size} at {signal['price']}")
                else:
                    logger.error(f"RL Sell order failed: {trade_result['error']}")
    
    def _execute_hold_signal(self, signal: Dict[str, Any], df: pd.DataFrame):
        """Execute hold signal."""
        # No action needed for hold signal
        logger.debug(f"RL Hold signal received: {signal['confidence']:.3f}")
    
    def _log_trade(self, side: str, size: float, price: float, trade_result: Dict[str, Any]):
        """Log trade with data integrity validation."""
        trade_data = {
            'id': trade_result.get('id', f"rl_trade_{int(time.time() * 1000)}"),
            'symbol': self.symbol,
            'side': side,
            'size': size,
            'price': price,
            'timestamp': datetime.now().isoformat(),
            'broker': self.broker,
            'model': 'rl',
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
            self.portfolio_value = self.broker_client.get_balance()['total_value']
    
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
            'last_signal_time': self.last_signal_time,
            'model_path': self.model_path
        }

def main():
    """Main RL strategy runner script."""
    parser = argparse.ArgumentParser(description='Run RL strategy')
    parser.add_argument('--symbol', type=str, default='XAUUSD', help='Trading symbol')
    parser.add_argument('--timeframe', type=str, default='1h', help='Timeframe')
    parser.add_argument('--model-path', type=str, required=True, help='Path to trained RL model')
    parser.add_argument('--broker', type=str, default='paper', help='Broker (paper/bybit)')
    
    args = parser.parse_args()
    
    # Initialize RL strategy runner
    runner = RLStrategyRunner(
        symbol=args.symbol,
        timeframe=args.timeframe,
        model_path=args.model_path,
        broker=args.broker
    )
    
    try:
        # Start strategy
        runner.start()
    except KeyboardInterrupt:
        logger.info("RL strategy stopped by user")
    finally:
        # Stop strategy
        runner.stop()
        
        # Print performance metrics
        metrics = runner.get_performance_metrics()
        print(f"RL strategy performance: {metrics}")

if __name__ == "__main__":
    main()