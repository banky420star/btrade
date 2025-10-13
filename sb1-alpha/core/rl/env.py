"""
RL Environment for price prediction with data integrity validation.
"""
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple, Optional
import gym
from gym import spaces
from core.util.logger import get_logger
from core.util.config import get_config

logger = get_logger(__name__)

class TradingEnvironment(gym.Env):
    """Trading environment for RL with data integrity validation."""
    
    def __init__(self, data: pd.DataFrame, config: Optional[Dict[str, Any]] = None):
        super().__init__()
        
        self.config = config or {
            'lookback': 50,
            'features': ['close', 'volume', 'rsi', 'macd', 'atr'],
            'action_space': 3,  # hold, buy, sell
            'reward_function': 'sharpe_ratio',
            'transaction_cost': 0.001,
            'max_position': 1.0
        }
        
        # Validate data
        self._validate_data(data)
        
        # Store data
        self.data = data.copy()
        self.features = self._prepare_features(data)
        
        # Environment state
        self.current_step = 0
        self.max_steps = len(self.features) - self.config['lookback']
        self.position = 0.0
        self.cash = 10000.0
        self.portfolio_value = 10000.0
        self.trades = []
        self.returns = []
        
        # Action and observation spaces
        self.action_space = spaces.Discrete(self.config['action_space'])
        self.observation_space = spaces.Box(
            low=-np.inf, high=np.inf, 
            shape=(self.config['lookback'], len(self.config['features'])),
            dtype=np.float32
        )
        
        logger.info(f"Trading environment initialized: {self.max_steps} steps, {len(self.config['features'])} features")
    
    def _validate_data(self, data: pd.DataFrame):
        """Validate input data integrity."""
        if data.empty:
            raise ValueError("Data is empty")
        
        # Check required columns
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing_cols = [col for col in required_cols if col not in data.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}")
        
        # Check for NaN values
        if data.isnull().any().any():
            logger.warning("NaN values found in data")
        
        # Check for infinite values
        if np.isinf(data.select_dtypes(include=[np.number])).any().any():
            logger.warning("Infinite values found in data")
        
        # Check minimum data length
        if len(data) < self.config['lookback'] + 10:
            raise ValueError(f"Insufficient data: need at least {self.config['lookback'] + 10} rows")
        
        logger.info("Data validation passed")
    
    def _prepare_features(self, data: pd.DataFrame) -> np.ndarray:
        """Prepare features for RL environment."""
        features = []
        
        for feature in self.config['features']:
            if feature == 'close':
                features.append(data['close'].values)
            elif feature == 'volume':
                features.append(data['volume'].values)
            elif feature == 'rsi':
                # Calculate RSI
                rsi = self._calculate_rsi(data['close'].values)
                features.append(rsi)
            elif feature == 'macd':
                # Calculate MACD
                macd = self._calculate_macd(data['close'].values)
                features.append(macd)
            elif feature == 'atr':
                # Calculate ATR
                atr = self._calculate_atr(data['high'].values, data['low'].values, data['close'].values)
                features.append(atr)
            else:
                logger.warning(f"Unknown feature: {feature}")
                features.append(np.zeros(len(data)))
        
        # Stack features
        feature_array = np.column_stack(features)
        
        # Normalize features
        feature_array = self._normalize_features(feature_array)
        
        return feature_array
    
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
    
    def _calculate_macd(self, prices: np.ndarray, fast: int = 12, slow: int = 26, signal: int = 9) -> np.ndarray:
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
    
    def _normalize_features(self, features: np.ndarray) -> np.ndarray:
        """Normalize features to [0, 1] range."""
        normalized = np.zeros_like(features)
        
        for i in range(features.shape[1]):
            col = features[:, i]
            if np.std(col) > 0:
                normalized[:, i] = (col - np.mean(col)) / np.std(col)
            else:
                normalized[:, i] = col
        
        return normalized
    
    def reset(self) -> np.ndarray:
        """Reset environment to initial state."""
        self.current_step = 0
        self.position = 0.0
        self.cash = 10000.0
        self.portfolio_value = 10000.0
        self.trades = []
        self.returns = []
        
        return self._get_observation()
    
    def step(self, action: int) -> Tuple[np.ndarray, float, bool, Dict[str, Any]]:
        """Execute one step in the environment."""
        if self.current_step >= self.max_steps:
            return self._get_observation(), 0.0, True, {}
        
        # Get current observation
        obs = self._get_observation()
        
        # Execute action
        reward = self._execute_action(action)
        
        # Update state
        self.current_step += 1
        
        # Check if episode is done
        done = self.current_step >= self.max_steps
        
        # Create info dictionary
        info = {
            'portfolio_value': self.portfolio_value,
            'position': self.position,
            'cash': self.cash,
            'step': self.current_step,
            'total_trades': len(self.trades)
        }
        
        return obs, reward, done, info
    
    def _get_observation(self) -> np.ndarray:
        """Get current observation."""
        start_idx = self.current_step
        end_idx = start_idx + self.config['lookback']
        
        if end_idx > len(self.features):
            # Pad with zeros if not enough data
            obs = np.zeros((self.config['lookback'], len(self.config['features'])))
            available_data = self.features[start_idx:]
            obs[:len(available_data)] = available_data
        else:
            obs = self.features[start_idx:end_idx]
        
        return obs.astype(np.float32)
    
    def _execute_action(self, action: int) -> float:
        """Execute trading action and return reward."""
        if self.current_step >= len(self.data):
            return 0.0
        
        # Get current price
        current_price = self.data['close'].iloc[self.current_step + self.config['lookback']]
        
        # Execute action
        if action == 0:  # Hold
            pass
        elif action == 1:  # Buy
            if self.position < self.config['max_position']:
                self._execute_trade('buy', current_price)
        elif action == 2:  # Sell
            if self.position > -self.config['max_position']:
                self._execute_trade('sell', current_price)
        
        # Calculate reward
        reward = self._calculate_reward()
        
        # Update portfolio value
        self._update_portfolio_value(current_price)
        
        return reward
    
    def _execute_trade(self, side: str, price: float):
        """Execute a trade."""
        trade_size = 0.1  # Fixed trade size for simplicity
        
        if side == 'buy':
            cost = price * trade_size * (1 + self.config['transaction_cost'])
            if cost <= self.cash:
                self.cash -= cost
                self.position += trade_size
                self.trades.append({
                    'step': self.current_step,
                    'side': side,
                    'price': price,
                    'size': trade_size,
                    'cost': cost
                })
        elif side == 'sell':
            if self.position >= trade_size:
                proceeds = price * trade_size * (1 - self.config['transaction_cost'])
                self.cash += proceeds
                self.position -= trade_size
                self.trades.append({
                    'step': self.current_step,
                    'side': side,
                    'price': price,
                    'size': trade_size,
                    'proceeds': proceeds
                })
    
    def _calculate_reward(self) -> float:
        """Calculate reward based on configured reward function."""
        if len(self.returns) < 2:
            return 0.0
        
        if self.config['reward_function'] == 'sharpe_ratio':
            return self._calculate_sharpe_ratio()
        elif self.config['reward_function'] == 'returns':
            return self.returns[-1]
        elif self.config['reward_function'] == 'portfolio_value':
            return (self.portfolio_value - 10000.0) / 10000.0
        else:
            return 0.0
    
    def _calculate_sharpe_ratio(self) -> float:
        """Calculate Sharpe ratio."""
        if len(self.returns) < 2:
            return 0.0
        
        returns_array = np.array(self.returns)
        if np.std(returns_array) == 0:
            return 0.0
        
        return np.mean(returns_array) / np.std(returns_array)
    
    def _update_portfolio_value(self, current_price: float):
        """Update portfolio value."""
        previous_value = self.portfolio_value
        self.portfolio_value = self.cash + self.position * current_price
        
        # Calculate return
        if previous_value > 0:
            return_rate = (self.portfolio_value - previous_value) / previous_value
            self.returns.append(return_rate)
    
    def get_performance_metrics(self) -> Dict[str, float]:
        """Get performance metrics."""
        if not self.returns:
            return {}
        
        returns_array = np.array(self.returns)
        
        metrics = {
            'total_return': (self.portfolio_value - 10000.0) / 10000.0,
            'sharpe_ratio': self._calculate_sharpe_ratio(),
            'max_drawdown': self._calculate_max_drawdown(),
            'win_rate': self._calculate_win_rate(),
            'total_trades': len(self.trades),
            'final_portfolio_value': self.portfolio_value
        }
        
        return metrics
    
    def _calculate_max_drawdown(self) -> float:
        """Calculate maximum drawdown."""
        if not self.returns:
            return 0.0
        
        cumulative_returns = np.cumprod(1 + np.array(self.returns))
        running_max = np.maximum.accumulate(cumulative_returns)
        drawdown = (cumulative_returns - running_max) / running_max
        
        return np.min(drawdown)
    
    def _calculate_win_rate(self) -> float:
        """Calculate win rate."""
        if not self.returns:
            return 0.0
        
        winning_trades = sum(1 for r in self.returns if r > 0)
        return winning_trades / len(self.returns)
    
    def render(self, mode: str = 'human'):
        """Render environment state."""
        if mode == 'human':
            print(f"Step: {self.current_step}/{self.max_steps}")
            print(f"Portfolio Value: ${self.portfolio_value:.2f}")
            print(f"Position: {self.position:.2f}")
            print(f"Cash: ${self.cash:.2f}")
            print(f"Total Trades: {len(self.trades)}")
    
    def close(self):
        """Close environment."""
        pass