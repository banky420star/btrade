"""
RL training script with data integrity validation and fast epochs.
"""
import argparse
import yaml
import pandas as pd
import numpy as np
from pathlib import Path
from typing import Dict, Any, List, Tuple
from datetime import datetime
import json
import matplotlib.pyplot as plt

from core.util.config import get_config
from core.util.logger import get_logger
from core.data.loaders import DataLoader
from core.rl.env import TradingEnvironment
from core.rl.ddqn import DoubleDQN

logger = get_logger(__name__)

class RLTrainer:
    """RL training with data integrity validation and fast epochs."""
    
    def __init__(self, config_path: str = "configs/rl.yaml"):
        self.config = self._load_config(config_path)
        self.data_loader = DataLoader()
        self.training_results = {}
        
    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load RL configuration."""
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        return config
    
    def load_data(self, symbol: str, timeframe: str, 
                  start_date: str, end_date: str) -> pd.DataFrame:
        """Load and validate data."""
        logger.info(f"Loading data for {symbol} {timeframe} from {start_date} to {end_date}")
        
        # Load data
        df = self.data_loader.load_historical_data(
            symbol=symbol,
            timeframe=timeframe,
            start_date=start_date,
            end_date=end_date
        )
        
        # Validate data integrity
        self._validate_data_integrity(df)
        
        logger.info(f"Loaded {len(df)} data points")
        return df
    
    def _validate_data_integrity(self, df: pd.DataFrame):
        """Validate data integrity."""
        # Check required columns
        required_cols = ['open', 'high', 'low', 'close', 'volume']
        missing_cols = [col for col in required_cols if col not in df.columns]
        if missing_cols:
            raise ValueError(f"Missing required columns: {missing_cols}")
        
        # Check for NaN values
        if df.isnull().any().any():
            logger.warning("NaN values found in data")
        
        # Check for infinite values
        if np.isinf(df.select_dtypes(include=[np.number])).any().any():
            logger.warning("Infinite values found in data")
        
        # Check minimum data length
        min_length = self.config['environment']['lookback'] + 100
        if len(df) < min_length:
            raise ValueError(f"Insufficient data: need at least {min_length} rows")
        
        logger.info("Data integrity validation passed")
    
    def create_environment(self, df: pd.DataFrame) -> TradingEnvironment:
        """Create trading environment."""
        env_config = self.config['environment']
        
        # Add technical indicators to data
        df_with_indicators = self._add_technical_indicators(df)
        
        # Create environment
        env = TradingEnvironment(df_with_indicators, env_config)
        
        logger.info(f"Environment created: {env.max_steps} steps, {env.action_space.n} actions")
        
        return env
    
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
    
    def train_agent(self, env: TradingEnvironment, 
                   episodes: int = 1000,
                   save_freq: int = 50) -> Dict[str, Any]:
        """Train RL agent with data integrity validation."""
        # Get environment dimensions
        state_size = env.observation_space.shape[0] * env.observation_space.shape[1]
        action_size = env.action_space.n
        
        # Create agent
        agent_config = self.config['model']
        agent = DoubleDQN(
            state_size=state_size,
            action_size=action_size,
            hidden_sizes=agent_config['architecture']['hidden_layers'],
            learning_rate=agent_config['training']['learning_rate'],
            gamma=agent_config['training']['gamma'],
            epsilon=agent_config['training']['epsilon_start'],
            epsilon_min=agent_config['training']['epsilon_end'],
            epsilon_decay=agent_config['training']['epsilon_decay'],
            batch_size=agent_config['training']['batch_size'],
            target_update_freq=agent_config['training']['target_update_freq'],
            prioritized_replay=agent_config['training']['prioritized_replay'],
            alpha=agent_config['training']['alpha'],
            beta=agent_config['training']['beta']
        )
        
        # Training statistics
        episode_rewards = []
        episode_lengths = []
        episode_returns = []
        episode_sharpe_ratios = []
        
        logger.info(f"Starting RL training: {episodes} episodes")
        
        for episode in range(episodes):
            # Reset environment
            state = env.reset()
            total_reward = 0
            step_count = 0
            
            while True:
                # Select action
                action = agent.act(state, training=True)
                
                # Execute action
                next_state, reward, done, info = env.step(action)
                
                # Store experience
                agent.remember(state, action, reward, next_state, done)
                
                # Train agent
                if len(agent.replay_buffer) >= agent.batch_size:
                    loss = agent.replay()
                
                # Update state
                state = next_state
                total_reward += reward
                step_count += 1
                
                if done:
                    break
            
            # Store episode statistics
            episode_rewards.append(total_reward)
            episode_lengths.append(step_count)
            
            # Get performance metrics
            metrics = env.get_performance_metrics()
            episode_returns.append(metrics.get('total_return', 0.0))
            episode_sharpe_ratios.append(metrics.get('sharpe_ratio', 0.0))
            
            # Log progress
            if episode % 10 == 0:
                avg_reward = np.mean(episode_rewards[-10:])
                avg_return = np.mean(episode_returns[-10:])
                avg_sharpe = np.mean(episode_sharpe_ratios[-10:])
                
                logger.info(f"Episode {episode}: Reward={avg_reward:.2f}, Return={avg_return:.4f}, Sharpe={avg_sharpe:.2f}")
            
            # Save model
            if episode % save_freq == 0 and episode > 0:
                model_path = f"models/registry/ddqn_episode_{episode}.pth"
                agent.save(model_path)
                logger.info(f"Model saved at episode {episode}")
        
        # Final model save
        final_model_path = "models/registry/ddqn_final.pth"
        agent.save(final_model_path)
        
        # Compile results
        self.training_results = {
            'episodes': episodes,
            'episode_rewards': episode_rewards,
            'episode_lengths': episode_lengths,
            'episode_returns': episode_returns,
            'episode_sharpe_ratios': episode_sharpe_ratios,
            'final_model_path': final_model_path,
            'agent_stats': agent.get_training_stats(),
            'timestamp': datetime.now().isoformat()
        }
        
        logger.info("RL training completed")
        
        return self.training_results
    
    def plot_training_results(self, save_path: str = "reports/rl_training_results.png"):
        """Plot training results."""
        if not self.training_results:
            logger.warning("No training results to plot")
            return
        
        fig, axes = plt.subplots(2, 2, figsize=(15, 10))
        
        # Episode rewards
        axes[0, 0].plot(self.training_results['episode_rewards'])
        axes[0, 0].set_title('Episode Rewards')
        axes[0, 0].set_xlabel('Episode')
        axes[0, 0].set_ylabel('Total Reward')
        axes[0, 0].grid(True)
        
        # Episode returns
        axes[0, 1].plot(self.training_results['episode_returns'])
        axes[0, 1].set_title('Episode Returns')
        axes[0, 1].set_xlabel('Episode')
        axes[0, 1].set_ylabel('Total Return')
        axes[0, 1].grid(True)
        
        # Sharpe ratios
        axes[1, 0].plot(self.training_results['episode_sharpe_ratios'])
        axes[1, 0].set_title('Episode Sharpe Ratios')
        axes[1, 0].set_xlabel('Episode')
        axes[1, 0].set_ylabel('Sharpe Ratio')
        axes[1, 0].grid(True)
        
        # Episode lengths
        axes[1, 1].plot(self.training_results['episode_lengths'])
        axes[1, 1].set_title('Episode Lengths')
        axes[1, 1].set_xlabel('Episode')
        axes[1, 1].set_ylabel('Steps')
        axes[1, 1].grid(True)
        
        plt.tight_layout()
        plt.savefig(save_path, dpi=300, bbox_inches='tight')
        logger.info(f"Training results plot saved to {save_path}")
        
        plt.show()
    
    def save_results(self, filepath: str = "models/registry/rl_training_results.json"):
        """Save training results."""
        if not self.training_results:
            logger.warning("No training results to save")
            return
        
        # Create directory if it doesn't exist
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        
        # Save results
        with open(filepath, 'w') as f:
            json.dump(self.training_results, f, indent=2)
        
        logger.info(f"Training results saved to {filepath}")
    
    def train(self, symbol: str, timeframe: str, 
              start_date: str, end_date: str,
              episodes: int = 1000) -> Dict[str, Any]:
        """Main training pipeline."""
        logger.info(f"Starting RL training for {symbol} {timeframe}")
        
        # Load data
        df = self.load_data(symbol, timeframe, start_date, end_date)
        
        # Create environment
        env = self.create_environment(df)
        
        # Train agent
        results = self.train_agent(env, episodes)
        
        # Plot results
        self.plot_training_results()
        
        # Save results
        self.save_results()
        
        logger.info("RL training completed successfully")
        
        return results

def main():
    """Main RL training script."""
    parser = argparse.ArgumentParser(description='Train RL model')
    parser.add_argument('--symbol', type=str, default='XAUUSD', help='Trading symbol')
    parser.add_argument('--timeframe', type=str, default='1h', help='Timeframe')
    parser.add_argument('--start-date', type=str, required=True, help='Start date (YYYY-MM-DD)')
    parser.add_argument('--end-date', type=str, required=True, help='End date (YYYY-MM-DD)')
    parser.add_argument('--episodes', type=int, default=1000, help='Number of training episodes')
    parser.add_argument('--config', type=str, default='configs/rl.yaml', help='Config file')
    
    args = parser.parse_args()
    
    # Initialize trainer
    trainer = RLTrainer(args.config)
    
    # Train model
    results = trainer.train(
        symbol=args.symbol,
        timeframe=args.timeframe,
        start_date=args.start_date,
        end_date=args.end_date,
        episodes=args.episodes
    )
    
    # Print results
    print(f"RL training completed for {args.symbol} {args.timeframe}")
    print(f"Final model saved to: {results['final_model_path']}")
    print(f"Average final reward: {np.mean(results['episode_rewards'][-100:]):.2f}")
    print(f"Average final return: {np.mean(results['episode_returns'][-100:]):.4f}")

if __name__ == "__main__":
    main()