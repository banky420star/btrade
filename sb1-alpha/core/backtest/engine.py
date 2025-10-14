"""
Unified backtesting engine supporting ML, RL, and EMA strategies with data integrity validation.
"""
import argparse
import pandas as pd
import numpy as np
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Union
from datetime import datetime
import matplotlib.pyplot as plt

from core.util.config import get_config
from core.util.logger import get_logger
from core.data.loaders import DataLoader
from core.ml.infer import MLInference
from core.rl.env import TradingEnvironment
from core.rl.ddqn import DoubleDQN
from core.risk.position_sizing import PositionSizer
from core.risk.max_drawdown_guard import MaxDrawdownGuard

logger = get_logger(__name__)

class BacktestEngine:
    """Unified backtesting engine with data integrity validation."""
    
    def __init__(self, config: Optional[Any] = None):
        self.config = config or get_config()
        self.data_loader = DataLoader()
        self.position_sizer = PositionSizer()
        self.drawdown_guard = MaxDrawdownGuard()
        
        # Backtest state
        self.trades = []
        self.equity_curve = []
        self.drawdown_curve = []
        self.returns = []
        
        logger.info("Backtest engine initialized")
    
    def run_backtest(self, strategy: str, data: pd.DataFrame, 
                    strategy_params: Dict[str, Any]) -> Dict[str, Any]:
        """Run backtest with specified strategy."""
        logger.info(f"Starting backtest with {strategy} strategy")
        
        # Validate data
        self._validate_data(data)
        
        # Initialize backtest state
        self._initialize_backtest_state()
        
        # Run strategy-specific backtest
        if strategy == 'ema':
            results = self._run_ema_backtest(data, strategy_params)
        elif strategy == 'ml':
            results = self._run_ml_backtest(data, strategy_params)
        elif strategy == 'rl':
            results = self._run_rl_backtest(data, strategy_params)
        else:
            raise ValueError(f"Unsupported strategy: {strategy}")
        
        # Calculate performance metrics
        metrics = self._calculate_performance_metrics()
        
        # Compile results
        backtest_results = {
            'strategy': strategy,
            'strategy_params': strategy_params,
            'data_info': {
                'symbol': data.get('symbol', 'UNKNOWN'),
                'timeframe': data.get('timeframe', 'UNKNOWN'),
                'start_date': str(data.index.min()),
                'end_date': str(data.index.max()),
                'total_bars': len(data)
            },
            'trades': self.trades,
            'equity_curve': self.equity_curve,
            'drawdown_curve': self.drawdown_curve,
            'performance_metrics': metrics,
            'timestamp': datetime.now().isoformat()
        }
        
        logger.info(f"Backtest completed: {len(self.trades)} trades, {metrics['total_return']:.2%} return")
        
        return backtest_results
    
    def _validate_data(self, data: pd.DataFrame):
        """Validate backtest data integrity."""
        if data.empty:
            raise ValueError("Backtest data is empty")
        
        # Check required columns
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing_cols = [col for col in required_cols if col not in data.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}")
        
        # Check for NaN values
        if data.isnull().any().any():
            logger.warning("NaN values found in backtest data")
        
        # Check for infinite values
        if np.isinf(data.select_dtypes(include=[np.number])).any().any():
            logger.warning("Infinite values found in backtest data")
        
        # Check minimum data length
        if len(data) < 100:
            raise ValueError("Insufficient data for backtesting")
        
        logger.info(f"Backtest data validation passed: {len(data)} bars")
    
    def _initialize_backtest_state(self):
        """Initialize backtest state."""
        self.trades = []
        self.equity_curve = []
        self.drawdown_curve = []
        self.returns = []
    
    def _run_ema_backtest(self, data: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        """Run EMA crossover strategy backtest."""
        fast_period = params.get('fast', 5)
        slow_period = params.get('slow', 20)
        initial_capital = params.get('initial_capital', 10000)
        risk_per_trade = params.get('risk_per_trade', 0.01)
        
        # Calculate EMAs
        data['ema_fast'] = data['close'].ewm(span=fast_period).mean()
        data['ema_slow'] = data['close'].ewm(span=slow_period).mean()
        
        # Generate signals
        data['signal'] = 0
        data['signal'][fast_period:] = np.where(
            data['ema_fast'][fast_period:] > data['ema_slow'][fast_period:], 1, 0
        )
        data['position'] = data['signal'].diff()
        
        # Execute trades
        capital = initial_capital
        position = 0.0
        
        for i in range(slow_period, len(data)):
            current_price = data['close'].iloc[i]
            current_time = data.index[i]
            
            # Check for position changes
            if data['position'].iloc[i] == 1:  # Buy signal
                if position <= 0:  # Not already long
                    # Calculate position size
                    position_size = self.position_sizer.calculate_size(
                        0.8,  # Fixed confidence for EMA
                        capital,
                        risk_per_trade
                    )
                    
                    if position_size > 0:
                        # Execute buy
                        cost = position_size * current_price
                        if cost <= capital:
                            capital -= cost
                            position += position_size
                            
                            self._record_trade(
                                'buy', position_size, current_price, 
                                current_time, capital + position * current_price
                            )
            
            elif data['position'].iloc[i] == -1:  # Sell signal
                if position > 0:  # Have long position
                    # Execute sell
                    proceeds = position * current_price
                    capital += proceeds
                    
                    self._record_trade(
                        'sell', position, current_price, 
                        current_time, capital + position * current_price
                    )
                    
                    position = 0.0
            
            # Update equity curve
            current_equity = capital + position * current_price
            self.equity_curve.append(current_equity)
            
            # Calculate return
            if len(self.equity_curve) > 1:
                return_rate = (current_equity - self.equity_curve[-2]) / self.equity_curve[-2]
                self.returns.append(return_rate)
        
        return {'strategy': 'ema', 'params': params}
    
    def _run_ml_backtest(self, data: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        """Run ML strategy backtest."""
        model_path = params.get('model_path')
        calibrator_path = params.get('calibrator_path')
        confidence_threshold = params.get('confidence_threshold', 0.6)
        initial_capital = params.get('initial_capital', 10000)
        risk_per_trade = params.get('risk_per_trade', 0.01)
        
        if not model_path:
            raise ValueError("Model path required for ML backtest")
        
        # Initialize ML inference
        ml_inference = MLInference(model_path)
        
        # Run backtest
        capital = initial_capital
        position = 0.0
        
        for i in range(50, len(data)):  # Start after enough data for indicators
            # Get data up to current point
            current_data = data.iloc[:i+1]
            
            try:
                # Generate signal
                signal = ml_inference.generate_signal(current_data, confidence_threshold)
                
                if signal and signal['signal'] in ['buy', 'sell']:
                    current_price = data['close'].iloc[i]
                    current_time = data.index[i]
                    
                    if signal['signal'] == 'buy' and position <= 0:
                        # Calculate position size
                        position_size = self.position_sizer.calculate_size(
                            signal['confidence'],
                            capital,
                            risk_per_trade
                        )
                        
                        if position_size > 0:
                            cost = position_size * current_price
                            if cost <= capital:
                                capital -= cost
                                position += position_size
                                
                                self._record_trade(
                                    'buy', position_size, current_price,
                                    current_time, capital + position * current_price
                                )
                    
                    elif signal['signal'] == 'sell' and position > 0:
                        # Execute sell
                        proceeds = position * current_price
                        capital += proceeds
                        
                        self._record_trade(
                            'sell', position, current_price,
                            current_time, capital + position * current_price
                        )
                        
                        position = 0.0
                
            except Exception as e:
                logger.warning(f"Failed to generate signal at step {i}: {e}")
                continue
            
            # Update equity curve
            current_equity = capital + position * current_price
            self.equity_curve.append(current_equity)
            
            # Calculate return
            if len(self.equity_curve) > 1:
                return_rate = (current_equity - self.equity_curve[-2]) / self.equity_curve[-2]
                self.returns.append(return_rate)
        
        return {'strategy': 'ml', 'params': params}
    
    def _run_rl_backtest(self, data: pd.DataFrame, params: Dict[str, Any]) -> Dict[str, Any]:
        """Run RL strategy backtest."""
        model_path = params.get('model_path')
        initial_capital = params.get('initial_capital', 10000)
        risk_per_trade = params.get('risk_per_trade', 0.01)
        
        if not model_path:
            raise ValueError("Model path required for RL backtest")
        
        # Create environment
        env_config = {
            'lookback': 50,
            'features': ['close', 'volume', 'rsi', 'macd', 'atr'],
            'action_space': 3,
            'reward_function': 'sharpe_ratio',
            'transaction_cost': 0.001,
            'max_position': 1.0
        }
        
        # Add technical indicators
        data_with_indicators = self._add_technical_indicators(data)
        
        # Create environment
        env = TradingEnvironment(data_with_indicators, env_config)
        
        # Load RL model
        agent = DoubleDQN(
            state_size=env.observation_space.shape[0] * env.observation_space.shape[1],
            action_size=env.action_space.n
        )
        agent.load(model_path)
        
        # Run backtest
        state = env.reset()
        done = False
        
        while not done:
            # Get action from agent
            action = agent.act(state, training=False)
            
            # Execute action
            next_state, reward, done, info = env.step(action)
            
            # Update state
            state = next_state
            
            # Record equity
            self.equity_curve.append(info.get('portfolio_value', 10000))
        
        # Get trades from environment
        self.trades = env.trades
        
        return {'strategy': 'rl', 'params': params}
    
    def _add_technical_indicators(self, data: pd.DataFrame) -> pd.DataFrame:
        """Add technical indicators to data."""
        df_indicators = data.copy()
        
        # Calculate RSI
        df_indicators['rsi'] = self._calculate_rsi(data['close'].values)
        
        # Calculate MACD
        df_indicators['macd'] = self._calculate_macd(data['close'].values)
        
        # Calculate ATR
        df_indicators['atr'] = self._calculate_atr(
            data['high'].values, data['low'].values, data['close'].values
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
    
    def _record_trade(self, side: str, size: float, price: float, 
                     timestamp: pd.Timestamp, equity: float):
        """Record trade with data integrity validation."""
        trade_data = {
            'id': f"trade_{len(self.trades) + 1}",
            'side': side,
            'size': size,
            'price': price,
            'timestamp': timestamp.isoformat(),
            'equity': equity
        }
        
        # Validate trade data
        self._validate_trade_data(trade_data)
        
        # Record trade
        self.trades.append(trade_data)
        
        # Log trade
        from core.util.logger import log_trade
        log_trade(trade_data)
    
    def _validate_trade_data(self, trade_data: Dict[str, Any]):
        """Validate trade data integrity."""
        required_fields = ['id', 'side', 'size', 'price', 'timestamp', 'equity']
        for field in required_fields:
            if field not in trade_data:
                raise ValueError(f"Missing required field: {field}")
        
        if trade_data['side'] not in ['buy', 'sell']:
            raise ValueError("Invalid trade side")
        
        if trade_data['size'] <= 0:
            raise ValueError("Trade size must be positive")
        
        if trade_data['price'] <= 0:
            raise ValueError("Trade price must be positive")
    
    def _calculate_performance_metrics(self) -> Dict[str, float]:
        """Calculate performance metrics."""
        if not self.equity_curve:
            return {}
        
        # Basic metrics
        initial_equity = self.equity_curve[0]
        final_equity = self.equity_curve[-1]
        total_return = (final_equity - initial_equity) / initial_equity
        
        # Calculate returns
        if len(self.equity_curve) > 1:
            returns = np.diff(self.equity_curve) / self.equity_curve[:-1]
        else:
            returns = np.array([0.0])
        
        # Risk metrics
        volatility = np.std(returns) * np.sqrt(252) if len(returns) > 1 else 0.0
        sharpe_ratio = np.mean(returns) / np.std(returns) * np.sqrt(252) if np.std(returns) > 0 else 0.0
        
        # Drawdown
        peak = np.maximum.accumulate(self.equity_curve)
        drawdown = (self.equity_curve - peak) / peak
        max_drawdown = np.min(drawdown)
        
        # Trade metrics
        total_trades = len(self.trades)
        winning_trades = sum(1 for trade in self.trades if trade['side'] == 'sell')
        win_rate = winning_trades / total_trades if total_trades > 0 else 0.0
        
        # Calmar ratio
        calmar_ratio = total_return / abs(max_drawdown) if max_drawdown != 0 else 0.0
        
        return {
            'total_return': total_return,
            'annualized_return': total_return * (252 / len(self.equity_curve)) if len(self.equity_curve) > 0 else 0.0,
            'volatility': volatility,
            'sharpe_ratio': sharpe_ratio,
            'max_drawdown': max_drawdown,
            'calmar_ratio': calmar_ratio,
            'total_trades': total_trades,
            'win_rate': win_rate,
            'final_equity': final_equity,
            'initial_equity': initial_equity
        }
    
    def plot_results(self, results: Dict[str, Any], save_path: str = "reports/backtest_results.png"):
        """Plot backtest results."""
        fig, axes = plt.subplots(2, 2, figsize=(15, 10))
        
        # Equity curve
        axes[0, 0].plot(self.equity_curve)
        axes[0, 0].set_title('Equity Curve')
        axes[0, 0].set_xlabel('Time')
        axes[0, 0].set_ylabel('Portfolio Value')
        axes[0, 0].grid(True)
        
        # Drawdown
        if self.equity_curve:
            peak = np.maximum.accumulate(self.equity_curve)
            drawdown = (np.array(self.equity_curve) - peak) / peak * 100
            axes[0, 1].fill_between(range(len(drawdown)), drawdown, 0, alpha=0.3, color='red')
            axes[0, 1].set_title('Drawdown')
            axes[0, 1].set_xlabel('Time')
            axes[0, 1].set_ylabel('Drawdown %')
            axes[0, 1].grid(True)
        
        # Returns distribution
        if self.returns:
            axes[1, 0].hist(self.returns, bins=50, alpha=0.7)
            axes[1, 0].set_title('Returns Distribution')
            axes[1, 0].set_xlabel('Return')
            axes[1, 0].set_ylabel('Frequency')
            axes[1, 0].grid(True)
        
        # Performance metrics
        metrics = results['performance_metrics']
        metric_names = ['Total Return', 'Sharpe Ratio', 'Max Drawdown', 'Win Rate']
        metric_values = [
            metrics.get('total_return', 0.0),
            metrics.get('sharpe_ratio', 0.0),
            metrics.get('max_drawdown', 0.0),
            metrics.get('win_rate', 0.0)
        ]
        
        axes[1, 1].bar(metric_names, metric_values)
        axes[1, 1].set_title('Performance Metrics')
        axes[1, 1].set_ylabel('Value')
        axes[1, 1].tick_params(axis='x', rotation=45)
        axes[1, 1].grid(True)
        
        plt.tight_layout()
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        logger.info(f"Backtest results plot saved to {save_path}")
        
        plt.show()
    
    def save_results(self, results: Dict[str, Any], filepath: str = "reports/backtest_results.json"):
        """Save backtest results."""
        # Create directory if it doesn't exist
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        
        # Save results
        with open(filepath, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        
        logger.info(f"Backtest results saved to {filepath}")

def main():
    """Main backtest script."""
    parser = argparse.ArgumentParser(description='Run backtest')
    parser.add_argument('--strategy', type=str, required=True, help='Strategy (ema/ml/rl)')
    parser.add_argument('--data-file', type=str, help='Data file path')
    parser.add_argument('--symbol', type=str, default='XAUUSD', help='Trading symbol')
    parser.add_argument('--timeframe', type=str, default='1h', help='Timeframe')
    parser.add_argument('--start-date', type=str, help='Start date (YYYY-MM-DD)')
    parser.add_argument('--end-date', type=str, help='End date (YYYY-MM-DD)')
    parser.add_argument('--model-path', type=str, help='Model path (for ml/rl strategies)')
    parser.add_argument('--fast', type=int, default=5, help='Fast EMA period (for ema strategy)')
    parser.add_argument('--slow', type=int, default=20, help='Slow EMA period (for ema strategy)')
    parser.add_argument('--confidence-threshold', type=float, default=0.6, help='Confidence threshold (for ml strategy)')
    parser.add_argument('--initial-capital', type=float, default=10000, help='Initial capital')
    parser.add_argument('--risk-per-trade', type=float, default=0.01, help='Risk per trade')
    parser.add_argument('--output', type=str, default='reports/backtest_results.json', help='Output file')
    
    args = parser.parse_args()
    
    # Initialize backtest engine
    engine = BacktestEngine()
    
    # Load data
    if args.data_file:
        data = pd.read_csv(args.data_file, index_col=0, parse_dates=True)
    else:
        from core.data.loaders import DataLoader
        data_loader = DataLoader()
        data = data_loader.load_historical_data(
            symbol=args.symbol,
            timeframe=args.timeframe,
            start_date=args.start_date,
            end_date=args.end_date
        )
    
    # Prepare strategy parameters
    strategy_params = {
        'initial_capital': args.initial_capital,
        'risk_per_trade': args.risk_per_trade
    }
    
    if args.strategy == 'ema':
        strategy_params.update({
            'fast': args.fast,
            'slow': args.slow
        })
    elif args.strategy == 'ml':
        strategy_params.update({
            'model_path': args.model_path,
            'confidence_threshold': args.confidence_threshold
        })
    elif args.strategy == 'rl':
        strategy_params.update({
            'model_path': args.model_path
        })
    
    # Run backtest
    results = engine.run_backtest(args.strategy, data, strategy_params)
    
    # Plot results
    engine.plot_results(results)
    
    # Save results
    engine.save_results(args.output)
    
    # Print summary
    metrics = results['performance_metrics']
    print(f"Backtest completed for {args.strategy} strategy")
    print(f"Total Return: {metrics['total_return']:.2%}")
    print(f"Sharpe Ratio: {metrics['sharpe_ratio']:.2f}")
    print(f"Max Drawdown: {metrics['max_drawdown']:.2%}")
    print(f"Total Trades: {metrics['total_trades']}")
    print(f"Win Rate: {metrics['win_rate']:.2%}")

if __name__ == "__main__":
    main()