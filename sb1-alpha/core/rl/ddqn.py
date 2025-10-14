"""
Double DQN implementation with prioritized replay and data integrity validation.
"""
import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
import torch.nn.functional as F
from collections import deque, namedtuple
import random
from typing import Tuple, List, Optional, Dict, Any
from core.util.logger import get_logger

logger = get_logger(__name__)

# Experience tuple
Experience = namedtuple('Experience', ['state', 'action', 'reward', 'next_state', 'done'])

class PrioritizedReplayBuffer:
    """Prioritized experience replay buffer with data integrity validation."""
    
    def __init__(self, capacity: int, alpha: float = 0.6, beta: float = 0.4):
        self.capacity = capacity
        self.alpha = alpha
        self.beta = beta
        self.buffer = []
        self.priorities = np.zeros(capacity, dtype=np.float32)
        self.position = 0
        self.size = 0
        
        logger.info(f"Prioritized replay buffer initialized: capacity={capacity}, alpha={alpha}, beta={beta}")
    
    def add(self, experience: Experience, priority: float = None):
        """Add experience to buffer with data integrity validation."""
        # Validate experience
        self._validate_experience(experience)
        
        if priority is None:
            priority = self.priorities.max() if self.size > 0 else 1.0
        
        if self.size < self.capacity:
            self.buffer.append(experience)
            self.size += 1
        else:
            self.buffer[self.position] = experience
        
        self.priorities[self.position] = priority
        self.position = (self.position + 1) % self.capacity
    
    def _validate_experience(self, experience: Experience):
        """Validate experience data integrity."""
        # Check state
        if not isinstance(experience.state, np.ndarray):
            raise ValueError("State must be numpy array")
        
        if np.isnan(experience.state).any():
            raise ValueError("State contains NaN values")
        
        if np.isinf(experience.state).any():
            raise ValueError("State contains infinite values")
        
        # Check action
        if not isinstance(experience.action, (int, np.integer)):
            raise ValueError("Action must be integer")
        
        # Check reward
        if not isinstance(experience.reward, (int, float, np.number)):
            raise ValueError("Reward must be numeric")
        
        if np.isnan(experience.reward) or np.isinf(experience.reward):
            raise ValueError("Reward contains NaN or infinite values")
        
        # Check next state
        if not isinstance(experience.next_state, np.ndarray):
            raise ValueError("Next state must be numpy array")
        
        if np.isnan(experience.next_state).any():
            raise ValueError("Next state contains NaN values")
        
        if np.isinf(experience.next_state).any():
            raise ValueError("Next state contains infinite values")
        
        # Check done
        if not isinstance(experience.done, bool):
            raise ValueError("Done must be boolean")
    
    def sample(self, batch_size: int) -> Tuple[List[Experience], np.ndarray, np.ndarray]:
        """Sample batch from buffer with prioritized sampling."""
        if self.size < batch_size:
            raise ValueError(f"Not enough experiences: {self.size} < {batch_size}")
        
        # Calculate sampling probabilities
        probs = self.priorities[:self.size] ** self.alpha
        probs = probs / probs.sum()
        
        # Sample indices
        indices = np.random.choice(self.size, batch_size, p=probs)
        
        # Calculate importance sampling weights
        weights = (self.size * probs[indices]) ** (-self.beta)
        weights = weights / weights.max()
        
        # Get experiences
        experiences = [self.buffer[i] for i in indices]
        
        return experiences, indices, weights
    
    def update_priorities(self, indices: np.ndarray, priorities: np.ndarray):
        """Update priorities for sampled experiences."""
        for idx, priority in zip(indices, priorities):
            self.priorities[idx] = priority
    
    def __len__(self):
        return self.size

class DQNNetwork(nn.Module):
    """Deep Q-Network with data integrity validation."""
    
    def __init__(self, input_size: int, hidden_sizes: List[int], output_size: int, dropout: float = 0.2):
        super().__init__()
        
        self.input_size = input_size
        self.output_size = output_size
        
        # Build network layers
        layers = []
        prev_size = input_size
        
        for hidden_size in hidden_sizes:
            layers.append(nn.Linear(prev_size, hidden_size))
            layers.append(nn.ReLU())
            layers.append(nn.Dropout(dropout))
            prev_size = hidden_size
        
        layers.append(nn.Linear(prev_size, output_size))
        
        self.network = nn.Sequential(*layers)
        
        logger.info(f"DQN network initialized: {input_size} -> {hidden_sizes} -> {output_size}")
    
    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Forward pass with data integrity validation."""
        # Validate input
        if torch.isnan(x).any():
            logger.warning("NaN values detected in input")
            x = torch.nan_to_num(x, nan=0.0)
        
        if torch.isinf(x).any():
            logger.warning("Infinite values detected in input")
            x = torch.nan_to_num(x, posinf=1e6, neginf=-1e6)
        
        # Forward pass
        output = self.network(x)
        
        # Validate output
        if torch.isnan(output).any():
            logger.warning("NaN values detected in output")
            output = torch.nan_to_num(output, nan=0.0)
        
        if torch.isinf(output).any():
            logger.warning("Infinite values detected in output")
            output = torch.nan_to_num(output, posinf=1e6, neginf=-1e6)
        
        return output

class DoubleDQN:
    """Double DQN agent with prioritized replay and data integrity validation."""
    
    def __init__(self, state_size: int, action_size: int, 
                 hidden_sizes: List[int] = [128, 64, 32],
                 learning_rate: float = 0.001,
                 gamma: float = 0.99,
                 epsilon: float = 1.0,
                 epsilon_min: float = 0.01,
                 epsilon_decay: float = 0.995,
                 buffer_size: int = 10000,
                 batch_size: int = 32,
                 target_update_freq: int = 100,
                 prioritized_replay: bool = True,
                 alpha: float = 0.6,
                 beta: float = 0.4):
        
        self.state_size = state_size
        self.action_size = action_size
        self.learning_rate = learning_rate
        self.gamma = gamma
        self.epsilon = epsilon
        self.epsilon_min = epsilon_min
        self.epsilon_decay = epsilon_decay
        self.batch_size = batch_size
        self.target_update_freq = target_update_freq
        
        # Device
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        logger.info(f"Using device: {self.device}")
        
        # Networks
        self.q_network = DQNNetwork(state_size, hidden_sizes, action_size).to(self.device)
        self.target_network = DQNNetwork(state_size, hidden_sizes, action_size).to(self.device)
        self.optimizer = optim.Adam(self.q_network.parameters(), lr=learning_rate)
        
        # Copy weights to target network
        self.target_network.load_state_dict(self.q_network.state_dict())
        
        # Replay buffer
        if prioritized_replay:
            self.replay_buffer = PrioritizedReplayBuffer(buffer_size, alpha, beta)
        else:
            self.replay_buffer = deque(maxlen=buffer_size)
        
        self.prioritized_replay = prioritized_replay
        
        # Training statistics
        self.training_step = 0
        self.losses = []
        
        logger.info(f"Double DQN initialized: state_size={state_size}, action_size={action_size}")
    
    def act(self, state: np.ndarray, training: bool = True) -> int:
        """Select action using epsilon-greedy policy with data integrity validation."""
        # Validate state
        if np.isnan(state).any():
            logger.warning("NaN values in state, using random action")
            return np.random.randint(self.action_size)
        
        if np.isinf(state).any():
            logger.warning("Infinite values in state, using random action")
            return np.random.randint(self.action_size)
        
        # Epsilon-greedy action selection
        if training and np.random.random() < self.epsilon:
            return np.random.randint(self.action_size)
        
        # Greedy action selection
        state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
        
        with torch.no_grad():
            q_values = self.q_network(state_tensor)
            action = q_values.argmax().item()
        
        return action
    
    def remember(self, state: np.ndarray, action: int, reward: float, 
                next_state: np.ndarray, done: bool):
        """Store experience in replay buffer with data integrity validation."""
        experience = Experience(state, action, reward, next_state, done)
        
        if self.prioritized_replay:
            # Calculate priority based on TD error
            state_tensor = torch.FloatTensor(state).unsqueeze(0).to(self.device)
            next_state_tensor = torch.FloatTensor(next_state).unsqueeze(0).to(self.device)
            
            with torch.no_grad():
                current_q = self.q_network(state_tensor)[0, action]
                next_q = self.target_network(next_state_tensor).max(1)[0]
                target_q = reward + (self.gamma * next_q * (1 - done))
                td_error = abs(current_q.item() - target_q.item())
                priority = td_error + 1e-6  # Small epsilon to avoid zero priority
            
            self.replay_buffer.add(experience, priority)
        else:
            self.replay_buffer.append(experience)
    
    def replay(self) -> float:
        """Train the network on a batch of experiences."""
        if len(self.replay_buffer) < self.batch_size:
            return 0.0
        
        # Sample batch
        if self.prioritized_replay:
            experiences, indices, weights = self.replay_buffer.sample(self.batch_size)
            weights = torch.FloatTensor(weights).to(self.device)
        else:
            experiences = random.sample(self.replay_buffer, self.batch_size)
            weights = torch.ones(self.batch_size).to(self.device)
        
        # Prepare batch data
        states = torch.FloatTensor([e.state for e in experiences]).to(self.device)
        actions = torch.LongTensor([e.action for e in experiences]).to(self.device)
        rewards = torch.FloatTensor([e.reward for e in experiences]).to(self.device)
        next_states = torch.FloatTensor([e.next_state for e in experiences]).to(self.device)
        dones = torch.BoolTensor([e.done for e in experiences]).to(self.device)
        
        # Current Q values
        current_q_values = self.q_network(states).gather(1, actions.unsqueeze(1))
        
        # Next Q values from target network
        with torch.no_grad():
            next_q_values = self.target_network(next_states).max(1)[0]
            target_q_values = rewards + (self.gamma * next_q_values * ~dones)
        
        # Calculate loss
        loss = F.mse_loss(current_q_values.squeeze(), target_q_values, reduction='none')
        weighted_loss = (loss * weights).mean()
        
        # Optimize
        self.optimizer.zero_grad()
        weighted_loss.backward()
        
        # Gradient clipping
        torch.nn.utils.clip_grad_norm_(self.q_network.parameters(), max_norm=1.0)
        
        self.optimizer.step()
        
        # Update priorities if using prioritized replay
        if self.prioritized_replay:
            with torch.no_grad():
                td_errors = loss.detach().cpu().numpy()
                self.replay_buffer.update_priorities(indices, td_errors + 1e-6)
        
        # Update target network
        self.training_step += 1
        if self.training_step % self.target_update_freq == 0:
            self.target_network.load_state_dict(self.q_network.state_dict())
        
        # Decay epsilon
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay
        
        # Store loss
        self.losses.append(weighted_loss.item())
        
        return weighted_loss.item()
    
    def save(self, filepath: str):
        """Save model and training state."""
        torch.save({
            'q_network_state_dict': self.q_network.state_dict(),
            'target_network_state_dict': self.target_network.state_dict(),
            'optimizer_state_dict': self.optimizer.state_dict(),
            'epsilon': self.epsilon,
            'training_step': self.training_step,
            'losses': self.losses
        }, filepath)
        
        logger.info(f"Model saved to {filepath}")
    
    def load(self, filepath: str):
        """Load model and training state."""
        checkpoint = torch.load(filepath, map_location=self.device)
        
        self.q_network.load_state_dict(checkpoint['q_network_state_dict'])
        self.target_network.load_state_dict(checkpoint['target_network_state_dict'])
        self.optimizer.load_state_dict(checkpoint['optimizer_state_dict'])
        self.epsilon = checkpoint['epsilon']
        self.training_step = checkpoint['training_step']
        self.losses = checkpoint['losses']
        
        logger.info(f"Model loaded from {filepath}")
    
    def get_training_stats(self) -> Dict[str, Any]:
        """Get training statistics."""
        return {
            'epsilon': self.epsilon,
            'training_step': self.training_step,
            'buffer_size': len(self.replay_buffer),
            'avg_loss': np.mean(self.losses[-100:]) if self.losses else 0.0,
            'total_losses': len(self.losses)
        }