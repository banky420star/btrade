"""
Paper trading broker with realistic fills and data integrity validation.
"""
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, List
from datetime import datetime
import uuid

import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from core.util.logger import get_logger
from core.util.config import get_config

logger = get_logger(__name__)

class PaperBroker:
    """Paper trading broker with realistic fills and data integrity validation."""
    
    def __init__(self, config: Optional[Any] = None):
        self.config = config or get_config()
        self.initial_balance = 10000.0
        self.cash = self.initial_balance
        self.positions = {}  # symbol -> quantity
        self.orders = []  # Order history
        self.trades = []  # Trade history
        self.slippage = 0.0001  # 0.01% slippage
        self.commission = 0.001  # 0.1% commission
        
        logger.info(f"Paper broker initialized: ${self.initial_balance} initial balance")
    
    def place_order(self, symbol: str, side: str, size: float, 
                   price: Optional[float] = None, order_type: str = 'market') -> Dict[str, Any]:
        """Place order with data integrity validation."""
        # Validate inputs
        self._validate_order_inputs(symbol, side, size, price, order_type)
        
        # Check if we have enough cash for buy orders
        if side == 'buy' and price:
            required_cash = size * price * (1 + self.commission)
            if required_cash > self.cash:
                return {
                    'success': False,
                    'error': f'Insufficient cash: need ${required_cash:.2f}, have ${self.cash:.2f}',
                    'order_id': None
                }
        
        # Check if we have enough position for sell orders
        if side == 'sell':
            current_position = self.positions.get(symbol, 0.0)
            if size > current_position:
                return {
                    'success': False,
                    'error': f'Insufficient position: need {size}, have {current_position}',
                    'order_id': None
                }
        
        # Generate order ID
        order_id = str(uuid.uuid4())
        
        # Create order
        order = {
            'id': order_id,
            'symbol': symbol,
            'side': side,
            'size': size,
            'price': price,
            'order_type': order_type,
            'status': 'pending',
            'timestamp': datetime.now().isoformat()
        }
        
        # Execute order
        try:
            execution_result = self._execute_order(order)
            
            if execution_result['success']:
                # Update positions and cash
                self._update_positions(symbol, side, size, execution_result['execution_price'])
                
                # Record trade
                self._record_trade(order, execution_result)
                
                logger.info(f"Order executed: {side} {size} {symbol} at {execution_result['execution_price']}")
                
                return {
                    'success': True,
                    'order_id': order_id,
                    'execution_price': execution_result['execution_price'],
                    'execution_time': execution_result['execution_time']
                }
            else:
                return {
                    'success': False,
                    'error': execution_result['error'],
                    'order_id': order_id
                }
                
        except Exception as e:
            logger.error(f"Order execution failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'order_id': order_id
            }
    
    def _validate_order_inputs(self, symbol: str, side: str, size: float, 
                              price: Optional[float], order_type: str):
        """Validate order input parameters."""
        if not symbol or not isinstance(symbol, str):
            raise ValueError("Symbol must be a non-empty string")
        
        if side not in ['buy', 'sell']:
            raise ValueError("Side must be 'buy' or 'sell'")
        
        if size <= 0:
            raise ValueError("Size must be positive")
        
        if np.isnan(size) or np.isinf(size):
            raise ValueError("Size contains NaN or infinite values")
        
        if price is not None and (price <= 0 or np.isnan(price) or np.isinf(price)):
            raise ValueError("Price must be positive and finite")
        
        if order_type not in ['market', 'limit']:
            raise ValueError("Order type must be 'market' or 'limit'")
    
    def _execute_order(self, order: Dict[str, Any]) -> Dict[str, Any]:
        """Execute order with realistic fills."""
        try:
            # Simulate market data delay
            import time
            time.sleep(0.001)  # 1ms delay
            
            # Get current market price (simplified)
            current_price = self._get_market_price(order['symbol'])
            
            # Apply slippage
            if order['side'] == 'buy':
                execution_price = current_price * (1 + self.slippage)
            else:
                execution_price = current_price * (1 - self.slippage)
            
            # Apply commission
            commission = execution_price * order['size'] * self.commission
            
            return {
                'success': True,
                'execution_price': execution_price,
                'commission': commission,
                'execution_time': datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def _get_market_price(self, symbol: str) -> float:
        """Get current market price (simplified simulation)."""
        # This is a simplified simulation
        # In a real implementation, you would get actual market data
        
        # Simulate price based on symbol
        base_prices = {
            'XAUUSD': 2000.0,
            'EURUSD': 1.1000,
            'GBPUSD': 1.2500,
            'USDJPY': 110.0,
            'AUDUSD': 0.7500
        }
        
        base_price = base_prices.get(symbol, 100.0)
        
        # Add some random variation
        variation = np.random.normal(0, 0.001)  # 0.1% standard deviation
        current_price = base_price * (1 + variation)
        
        return current_price
    
    def _update_positions(self, symbol: str, side: str, size: float, price: float):
        """Update positions and cash after order execution."""
        # Calculate cost/proceeds
        if side == 'buy':
            cost = size * price * (1 + self.commission)
            self.cash -= cost
            self.positions[symbol] = self.positions.get(symbol, 0.0) + size
        else:
            proceeds = size * price * (1 - self.commission)
            self.cash += proceeds
            self.positions[symbol] = self.positions.get(symbol, 0.0) - size
        
        # Remove zero positions
        if abs(self.positions.get(symbol, 0.0)) < 1e-8:
            self.positions.pop(symbol, None)
    
    def _record_trade(self, order: Dict[str, Any], execution_result: Dict[str, Any]):
        """Record trade in history."""
        trade = {
            'id': str(uuid.uuid4()),
            'order_id': order['id'],
            'symbol': order['symbol'],
            'side': order['side'],
            'size': order['size'],
            'price': execution_result['execution_price'],
            'commission': execution_result['commission'],
            'timestamp': execution_result['execution_time'],
            'broker': 'paper'
        }
        
        self.trades.append(trade)
        
        # Log trade
        from core.util.logger import log_trade
        log_trade(trade)
    
    def get_balance(self) -> Dict[str, float]:
        """Get current balance information."""
        # Calculate total portfolio value
        total_value = self.cash
        
        for symbol, quantity in self.positions.items():
            current_price = self._get_market_price(symbol)
            total_value += quantity * current_price
        
        return {
            'cash': self.cash,
            'total_value': total_value,
            'positions': self.positions.copy(),
            'unrealized_pnl': total_value - self.initial_balance
        }
    
    def get_positions(self) -> Dict[str, float]:
        """Get current positions."""
        return self.positions.copy()
    
    def get_trades(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get trade history."""
        if limit:
            return self.trades[-limit:]
        return self.trades.copy()
    
    def get_orders(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get order history."""
        if limit:
            return self.orders[-limit:]
        return self.orders.copy()
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get performance metrics."""
        if not self.trades:
            return {
                'total_trades': 0,
                'win_rate': 0.0,
                'total_pnl': 0.0,
                'sharpe_ratio': 0.0
            }
        
        # Calculate metrics
        total_trades = len(self.trades)
        
        # Calculate P&L for each trade
        trade_pnls = []
        for trade in self.trades:
            if trade['side'] == 'buy':
                # Find corresponding sell trade
                sell_trade = self._find_corresponding_sell(trade)
                if sell_trade:
                    pnl = (sell_trade['price'] - trade['price']) * trade['size'] - trade['commission'] - sell_trade['commission']
                    trade_pnls.append(pnl)
        
        # Calculate win rate
        winning_trades = sum(1 for pnl in trade_pnls if pnl > 0)
        win_rate = winning_trades / len(trade_pnls) if trade_pnls else 0.0
        
        # Calculate total P&L
        total_pnl = sum(trade_pnls)
        
        # Calculate Sharpe ratio (simplified)
        if trade_pnls and len(trade_pnls) > 1:
            returns = np.array(trade_pnls) / self.initial_balance
            sharpe_ratio = np.mean(returns) / np.std(returns) * np.sqrt(252) if np.std(returns) > 0 else 0.0
        else:
            sharpe_ratio = 0.0
        
        return {
            'total_trades': total_trades,
            'win_rate': win_rate,
            'total_pnl': total_pnl,
            'sharpe_ratio': sharpe_ratio,
            'current_balance': self.get_balance()['total_value']
        }
    
    def _find_corresponding_sell(self, buy_trade: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Find corresponding sell trade for a buy trade."""
        for trade in self.trades:
            if (trade['symbol'] == buy_trade['symbol'] and 
                trade['side'] == 'sell' and 
                trade['timestamp'] > buy_trade['timestamp']):
                return trade
        return None
    
    def reset(self):
        """Reset broker to initial state."""
        self.cash = self.initial_balance
        self.positions = {}
        self.orders = []
        self.trades = []
        
        logger.info("Paper broker reset to initial state")
    
    def set_initial_balance(self, balance: float):
        """Set initial balance."""
        if balance <= 0:
            raise ValueError("Initial balance must be positive")
        
        self.initial_balance = balance
        self.cash = balance
        
        logger.info(f"Initial balance set to ${balance}")
    
    def get_broker_info(self) -> Dict[str, Any]:
        """Get broker information."""
        return {
            'broker_type': 'paper',
            'initial_balance': self.initial_balance,
            'slippage': self.slippage,
            'commission': self.commission,
            'current_balance': self.get_balance(),
            'total_trades': len(self.trades),
            'total_orders': len(self.orders)
        }