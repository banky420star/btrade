"""
Broker interface with data integrity validation.
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional, List
from datetime import datetime

class BrokerInterface(ABC):
    """Abstract broker interface with data integrity validation."""
    
    @abstractmethod
    def place_order(self, symbol: str, side: str, size: float, 
                   price: Optional[float] = None, order_type: str = 'market') -> Dict[str, Any]:
        """Place order with data integrity validation."""
        pass
    
    @abstractmethod
    def get_balance(self) -> Dict[str, float]:
        """Get current balance information."""
        pass
    
    @abstractmethod
    def get_positions(self) -> Dict[str, float]:
        """Get current positions."""
        pass
    
    @abstractmethod
    def get_trades(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get trade history."""
        pass
    
    @abstractmethod
    def get_orders(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get order history."""
        pass
    
    @abstractmethod
    def get_performance_metrics(self) -> Dict[str, Any]:
        """Get performance metrics."""
        pass
    
    @abstractmethod
    def get_broker_info(self) -> Dict[str, Any]:
        """Get broker information."""
        pass