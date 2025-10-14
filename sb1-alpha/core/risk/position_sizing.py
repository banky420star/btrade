"""
Position sizing with Kelly criterion and data integrity validation.
"""
import numpy as np
from typing import Dict, Any, Optional
from core.util.logger import get_logger
from core.util.config import get_config

logger = get_logger(__name__)

class PositionSizer:
    """Position sizing with Kelly criterion and data integrity validation."""
    
    def __init__(self, config: Optional[Any] = None):
        self.config = config or get_config()
        self.max_position_size = 0.1  # Maximum 10% of portfolio per trade
        self.min_position_size = 0.001  # Minimum 0.1% of portfolio per trade
        
        logger.info("Position sizer initialized")
    
    def calculate_size(self, confidence: float, portfolio_value: float, 
                      risk_per_trade: float) -> float:
        """Calculate position size using Kelly criterion with data integrity validation."""
        # Validate inputs
        self._validate_inputs(confidence, portfolio_value, risk_per_trade)
        
        # Calculate Kelly fraction
        kelly_fraction = self._calculate_kelly_fraction(confidence)
        
        # Apply risk per trade limit
        risk_fraction = min(kelly_fraction, risk_per_trade)
        
        # Calculate position size
        position_size = portfolio_value * risk_fraction
        
        # Apply position size limits
        position_size = max(position_size, portfolio_value * self.min_position_size)
        position_size = min(position_size, portfolio_value * self.max_position_size)
        
        # Log position sizing decision
        logger.debug(f"Position sizing: confidence={confidence:.3f}, "
                    f"kelly_fraction={kelly_fraction:.3f}, "
                    f"risk_fraction={risk_fraction:.3f}, "
                    f"position_size={position_size:.2f}")
        
        return position_size
    
    def _validate_inputs(self, confidence: float, portfolio_value: float, risk_per_trade: float):
        """Validate input parameters."""
        if not (0 <= confidence <= 1):
            raise ValueError("Confidence must be between 0 and 1")
        
        if portfolio_value <= 0:
            raise ValueError("Portfolio value must be positive")
        
        if not (0 < risk_per_trade <= 1):
            raise ValueError("Risk per trade must be between 0 and 1")
        
        if np.isnan(confidence) or np.isinf(confidence):
            raise ValueError("Confidence contains NaN or infinite values")
        
        if np.isnan(portfolio_value) or np.isinf(portfolio_value):
            raise ValueError("Portfolio value contains NaN or infinite values")
    
    def _calculate_kelly_fraction(self, confidence: float) -> float:
        """Calculate Kelly fraction based on confidence."""
        # Simple Kelly formula: f = (bp - q) / b
        # where b = odds, p = probability of win, q = probability of loss
        
        # For trading, we assume:
        # - b = 1 (1:1 odds)
        # - p = confidence (probability of win)
        # - q = 1 - confidence (probability of loss)
        
        p = confidence
        q = 1 - confidence
        b = 1.0
        
        # Kelly fraction
        kelly_fraction = (b * p - q) / b
        
        # Ensure non-negative
        kelly_fraction = max(kelly_fraction, 0.0)
        
        return kelly_fraction
    
    def calculate_optimal_size(self, win_rate: float, avg_win: float, 
                              avg_loss: float, portfolio_value: float) -> float:
        """Calculate optimal position size using historical performance."""
        # Validate inputs
        self._validate_performance_inputs(win_rate, avg_win, avg_loss, portfolio_value)
        
        # Calculate Kelly fraction
        # f = (bp - q) / b
        # where b = avg_win / avg_loss, p = win_rate, q = 1 - win_rate
        
        if avg_loss == 0:
            logger.warning("Average loss is zero, using default position size")
            return portfolio_value * 0.01
        
        b = avg_win / avg_loss
        p = win_rate
        q = 1 - win_rate
        
        kelly_fraction = (b * p - q) / b
        
        # Ensure non-negative
        kelly_fraction = max(kelly_fraction, 0.0)
        
        # Apply position size limits
        position_size = portfolio_value * kelly_fraction
        position_size = max(position_size, portfolio_value * self.min_position_size)
        position_size = min(position_size, portfolio_value * self.max_position_size)
        
        logger.info(f"Optimal position size: {position_size:.2f} "
                   f"(Kelly fraction: {kelly_fraction:.3f})")
        
        return position_size
    
    def _validate_performance_inputs(self, win_rate: float, avg_win: float, 
                                   avg_loss: float, portfolio_value: float):
        """Validate performance input parameters."""
        if not (0 <= win_rate <= 1):
            raise ValueError("Win rate must be between 0 and 1")
        
        if avg_win < 0:
            raise ValueError("Average win must be non-negative")
        
        if avg_loss < 0:
            raise ValueError("Average loss must be non-negative")
        
        if portfolio_value <= 0:
            raise ValueError("Portfolio value must be positive")
        
        # Check for NaN or infinite values
        for value, name in [(win_rate, 'win_rate'), (avg_win, 'avg_win'), 
                           (avg_loss, 'avg_loss'), (portfolio_value, 'portfolio_value')]:
            if np.isnan(value) or np.isinf(value):
                raise ValueError(f"{name} contains NaN or infinite values")
    
    def calculate_risk_adjusted_size(self, confidence: float, portfolio_value: float,
                                   risk_per_trade: float, volatility: float) -> float:
        """Calculate risk-adjusted position size considering volatility."""
        # Validate inputs
        self._validate_inputs(confidence, portfolio_value, risk_per_trade)
        
        if volatility <= 0:
            raise ValueError("Volatility must be positive")
        
        if np.isnan(volatility) or np.isinf(volatility):
            raise ValueError("Volatility contains NaN or infinite values")
        
        # Calculate base position size
        base_size = self.calculate_size(confidence, portfolio_value, risk_per_trade)
        
        # Adjust for volatility (higher volatility = smaller position)
        volatility_adjustment = 1.0 / (1.0 + volatility)
        
        # Apply volatility adjustment
        adjusted_size = base_size * volatility_adjustment
        
        # Apply position size limits
        adjusted_size = max(adjusted_size, portfolio_value * self.min_position_size)
        adjusted_size = min(adjusted_size, portfolio_value * self.max_position_size)
        
        logger.debug(f"Risk-adjusted position size: {adjusted_size:.2f} "
                    f"(volatility: {volatility:.3f}, adjustment: {volatility_adjustment:.3f})")
        
        return adjusted_size
    
    def calculate_portfolio_heat(self, positions: Dict[str, float], 
                               portfolio_value: float) -> float:
        """Calculate portfolio heat (total risk exposure)."""
        if not positions:
            return 0.0
        
        # Calculate total position value
        total_position_value = sum(abs(size) for size in positions.values())
        
        # Calculate portfolio heat
        portfolio_heat = total_position_value / portfolio_value
        
        logger.debug(f"Portfolio heat: {portfolio_heat:.3f} "
                    f"(total positions: {total_position_value:.2f})")
        
        return portfolio_heat
    
    def check_position_limits(self, new_position_size: float, 
                            existing_positions: Dict[str, float],
                            portfolio_value: float) -> bool:
        """Check if new position violates limits."""
        # Calculate current portfolio heat
        current_heat = self.calculate_portfolio_heat(existing_positions, portfolio_value)
        
        # Calculate new portfolio heat
        new_heat = current_heat + (new_position_size / portfolio_value)
        
        # Check against maximum portfolio heat
        max_portfolio_heat = 0.5  # Maximum 50% of portfolio at risk
        
        if new_heat > max_portfolio_heat:
            logger.warning(f"Position would exceed portfolio heat limit: "
                          f"{new_heat:.3f} > {max_portfolio_heat:.3f}")
            return False
        
        # Check individual position size
        if new_position_size > portfolio_value * self.max_position_size:
            logger.warning(f"Position size exceeds individual limit: "
                          f"{new_position_size:.2f} > {portfolio_value * self.max_position_size:.2f}")
            return False
        
        return True
    
    def get_position_sizing_stats(self) -> Dict[str, Any]:
        """Get position sizing statistics."""
        return {
            'max_position_size': self.max_position_size,
            'min_position_size': self.min_position_size,
            'max_portfolio_heat': 0.5,
            'kelly_formula': 'f = (bp - q) / b'
        }