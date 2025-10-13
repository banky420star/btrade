"""
Bybit broker adapter with data integrity validation.
"""
import ccxt
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, List
from datetime import datetime
import uuid

from core.util.logger import get_logger
from core.util.config import get_config

logger = get_logger(__name__)

class BybitBroker:
    """Bybit broker adapter with data integrity validation."""
    
    def __init__(self, config: Optional[Any] = None):
        self.config = config or get_config()
        
        # Initialize Bybit exchange
        self.exchange = ccxt.bybit({
            'apiKey': self.config.bybit_key,
            'secret': self.config.bybit_secret,
            'sandbox': self.config.bybit_testnet,
            'enableRateLimit': True
        })
        
        # Validate configuration
        self._validate_config()
        
        # Broker state
        self.positions = {}
        self.orders = []
        self.trades = []
        
        logger.info(f"Bybit broker initialized: {'testnet' if self.config.bybit_testnet else 'live'}")
    
    def _validate_config(self):
        """Validate broker configuration."""
        if not self.config.bybit_key:
            raise ValueError("Bybit API key not configured")
        
        if not self.config.bybit_secret:
            raise ValueError("Bybit API secret not configured")
        
        # Test connection
        try:
            self.exchange.fetch_balance()
            logger.info("Bybit connection successful")
        except Exception as e:
            logger.error(f"Bybit connection failed: {e}")
            raise
    
    def place_order(self, symbol: str, side: str, size: float, 
                   price: Optional[float] = None, order_type: str = 'market') -> Dict[str, Any]:
        """Place order with data integrity validation."""
        # Validate inputs
        self._validate_order_inputs(symbol, side, size, price, order_type)
        
        try:
            # Prepare order parameters
            order_params = {
                'symbol': symbol,
                'side': side,
                'amount': size,
                'type': order_type
            }
            
            if price and order_type == 'limit':
                order_params['price'] = price
            
            # Place order
            order = self.exchange.create_order(**order_params)
            
            # Validate order response
            self._validate_order_response(order)
            
            # Record order
            self._record_order(order)
            
            logger.info(f"Order placed: {side} {size} {symbol} at {price or 'market'}")
            
            return {
                'success': True,
                'order_id': order['id'],
                'status': order['status'],
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Order placement failed: {e}")
            return {
                'success': False,
                'error': str(e),
                'order_id': None
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
    
    def _validate_order_response(self, order: Dict[str, Any]):
        """Validate order response from exchange."""
        required_fields = ['id', 'status', 'symbol', 'side', 'amount']
        for field in required_fields:
            if field not in order:
                raise ValueError(f"Missing required field in order response: {field}")
        
        if order['status'] not in ['open', 'closed', 'canceled', 'rejected']:
            logger.warning(f"Unknown order status: {order['status']}")
    
    def _record_order(self, order: Dict[str, Any]):
        """Record order in history."""
        order_record = {
            'id': order['id'],
            'symbol': order['symbol'],
            'side': order['side'],
            'size': order['amount'],
            'price': order.get('price'),
            'status': order['status'],
            'timestamp': datetime.now().isoformat(),
            'broker': 'bybit'
        }
        
        self.orders.append(order_record)
    
    def get_balance(self) -> Dict[str, float]:
        """Get current balance information."""
        try:
            balance = self.exchange.fetch_balance()
            
            # Validate balance response
            self._validate_balance_response(balance)
            
            return {
                'cash': balance['free'].get('USDT', 0.0),
                'total_value': balance['total'].get('USDT', 0.0),
                'margin': balance['used'].get('USDT', 0.0),
                'unrealized_pnl': balance.get('info', {}).get('unrealizedPnl', 0.0)
            }
            
        except Exception as e:
            logger.error(f"Failed to fetch balance: {e}")
            return {
                'cash': 0.0,
                'total_value': 0.0,
                'margin': 0.0,
                'unrealized_pnl': 0.0
            }
    
    def _validate_balance_response(self, balance: Dict[str, Any]):
        """Validate balance response from exchange."""
        required_fields = ['free', 'total', 'used']
        for field in required_fields:
            if field not in balance:
                raise ValueError(f"Missing required field in balance response: {field}")
        
        # Check for negative values
        for currency, values in balance['free'].items():
            if values < 0:
                logger.warning(f"Negative free balance for {currency}: {values}")
    
    def get_positions(self) -> Dict[str, float]:
        """Get current positions."""
        try:
            positions = self.exchange.fetch_positions()
            
            # Process positions
            position_dict = {}
            for pos in positions:
                if pos['contracts'] > 0:  # Only include non-zero positions
                    position_dict[pos['symbol']] = pos['contracts']
            
            return position_dict
            
        except Exception as e:
            logger.error(f"Failed to fetch positions: {e}")
            return {}
    
    def get_trades(self, symbol: Optional[str] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get trade history."""
        try:
            trades = self.exchange.fetch_my_trades(symbol, limit=limit)
            
            # Process trades
            trade_list = []
            for trade in trades:
                trade_record = {
                    'id': trade['id'],
                    'symbol': trade['symbol'],
                    'side': trade['side'],
                    'size': trade['amount'],
                    'price': trade['price'],
                    'fee': trade['fee'],
                    'timestamp': trade['timestamp'],
                    'broker': 'bybit'
                }
                trade_list.append(trade_record)
            
            return trade_list
            
        except Exception as e:
            logger.error(f"Failed to fetch trades: {e}")
            return []
    
    def get_orders(self, symbol: Optional[str] = None, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get order history."""
        try:
            orders = self.exchange.fetch_orders(symbol, limit=limit)
            
            # Process orders
            order_list = []
            for order in orders:
                order_record = {
                    'id': order['id'],
                    'symbol': order['symbol'],
                    'side': order['side'],
                    'size': order['amount'],
                    'price': order.get('price'),
                    'status': order['status'],
                    'timestamp': order['timestamp'],
                    'broker': 'bybit'
                }
                order_list.append(order_record)
            
            return order_list
            
        except Exception as e:
            logger.error(f"Failed to fetch orders: {e}")
            return []
    
    def cancel_order(self, order_id: str, symbol: str) -> Dict[str, Any]:
        """Cancel order."""
        try:
            result = self.exchange.cancel_order(order_id, symbol)
            
            logger.info(f"Order canceled: {order_id}")
            
            return {
                'success': True,
                'order_id': order_id,
                'status': 'canceled'
            }
            
        except Exception as e:
            logger.error(f"Failed to cancel order {order_id}: {e}")
            return {
                'success': False,
                'error': str(e),
                'order_id': order_id
            }
    
    def get_market_data(self, symbol: str) -> Dict[str, Any]:
        """Get current market data."""
        try:
            ticker = self.exchange.fetch_ticker(symbol)
            
            return {
                'symbol': symbol,
                'bid': ticker['bid'],
                'ask': ticker['ask'],
                'last': ticker['last'],
                'volume': ticker['baseVolume'],
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Failed to fetch market data for {symbol}: {e}")
            return {}
    
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get performance metrics."""
        try:
            # Get account info
            account = self.exchange.fetch_balance()
            
            # Calculate metrics
            total_value = account['total'].get('USDT', 0.0)
            unrealized_pnl = account.get('info', {}).get('unrealizedPnl', 0.0)
            
            # Get trade history
            trades = self.get_trades(limit=100)
            
            # Calculate win rate
            if trades:
                winning_trades = sum(1 for trade in trades if trade.get('fee', 0) > 0)
                win_rate = winning_trades / len(trades)
            else:
                win_rate = 0.0
            
            return {
                'total_value': total_value,
                'unrealized_pnl': unrealized_pnl,
                'total_trades': len(trades),
                'win_rate': win_rate,
                'broker': 'bybit'
            }
            
        except Exception as e:
            logger.error(f"Failed to calculate performance metrics: {e}")
            return {
                'total_value': 0.0,
                'unrealized_pnl': 0.0,
                'total_trades': 0,
                'win_rate': 0.0,
                'broker': 'bybit'
            }
    
    def get_broker_info(self) -> Dict[str, Any]:
        """Get broker information."""
        return {
            'broker_type': 'bybit',
            'testnet': self.config.bybit_testnet,
            'api_key_configured': bool(self.config.bybit_key),
            'current_balance': self.get_balance(),
            'total_trades': len(self.trades),
            'total_orders': len(self.orders)
        }