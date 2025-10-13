"""
Maximum drawdown protection with data integrity validation.
"""
import numpy as np
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from core.util.logger import get_logger
from core.util.config import get_config

logger = get_logger(__name__)

class MaxDrawdownGuard:
    """Maximum drawdown protection with data integrity validation."""
    
    def __init__(self, config: Optional[Any] = None):
        self.config = config or get_config()
        self.max_drawdown_pct = self.config.max_drawdown_pct
        self.peak_value = 0.0
        self.current_drawdown = 0.0
        self.drawdown_history = []
        self.emergency_stop_triggered = False
        
        logger.info(f"Max drawdown guard initialized: {self.max_drawdown_pct:.1%} limit")
    
    def check_limits(self, current_value: float) -> bool:
        """Check if current value violates drawdown limits."""
        # Validate input
        self._validate_value(current_value)
        
        # Update peak value
        if current_value > self.peak_value:
            self.peak_value = current_value
            self.current_drawdown = 0.0
        else:
            # Calculate current drawdown
            self.current_drawdown = (self.peak_value - current_value) / self.peak_value
        
        # Record drawdown
        self._record_drawdown(current_value)
        
        # Check against limit
        if self.current_drawdown > self.max_drawdown_pct:
            if not self.emergency_stop_triggered:
                self._trigger_emergency_stop()
            return False
        
        return True
    
    def _validate_value(self, value: float):
        """Validate input value."""
        if value < 0:
            raise ValueError("Value must be non-negative")
        
        if np.isnan(value) or np.isinf(value):
            raise ValueError("Value contains NaN or infinite values")
    
    def _record_drawdown(self, current_value: float):
        """Record drawdown data."""
        drawdown_data = {
            'timestamp': datetime.now().isoformat(),
            'current_value': current_value,
            'peak_value': self.peak_value,
            'drawdown': self.current_drawdown,
            'drawdown_pct': self.current_drawdown * 100
        }
        
        # Add to history
        self.drawdown_history.append(drawdown_data)
        
        # Keep only last 1000 records
        if len(self.drawdown_history) > 1000:
            self.drawdown_history = self.drawdown_history[-1000:]
        
        # Log significant drawdowns
        if self.current_drawdown > 0.05:  # 5% drawdown
            logger.warning(f"Significant drawdown: {self.current_drawdown:.2%}")
    
    def _trigger_emergency_stop(self):
        """Trigger emergency stop."""
        self.emergency_stop_triggered = True
        
        logger.error(f"EMERGENCY STOP TRIGGERED: Drawdown {self.current_drawdown:.2%} "
                    f"exceeds limit {self.max_drawdown_pct:.2%}")
        
        # Send alert
        self._send_emergency_alert()
    
    def _send_emergency_alert(self):
        """Send emergency alert."""
        try:
            from core.util.logger import log_data_integrity_check
            
            alert_data = {
                'type': 'emergency_stop',
                'reason': 'max_drawdown_exceeded',
                'current_drawdown': self.current_drawdown,
                'max_drawdown_limit': self.max_drawdown_pct,
                'peak_value': self.peak_value,
                'timestamp': datetime.now().isoformat()
            }
            
            log_data_integrity_check(alert_data)
            
        except Exception as e:
            logger.error(f"Failed to send emergency alert: {e}")
    
    def reset(self):
        """Reset drawdown guard."""
        self.peak_value = 0.0
        self.current_drawdown = 0.0
        self.emergency_stop_triggered = False
        
        logger.info("Drawdown guard reset")
    
    def get_drawdown_stats(self) -> Dict[str, Any]:
        """Get drawdown statistics."""
        if not self.drawdown_history:
            return {}
        
        # Calculate statistics
        drawdowns = [d['drawdown'] for d in self.drawdown_history]
        
        stats = {
            'current_drawdown': self.current_drawdown,
            'max_drawdown': max(drawdowns) if drawdowns else 0.0,
            'avg_drawdown': np.mean(drawdowns) if drawdowns else 0.0,
            'drawdown_count': len(drawdowns),
            'emergency_stop_triggered': self.emergency_stop_triggered,
            'peak_value': self.peak_value
        }
        
        return stats
    
    def get_drawdown_history(self, hours: int = 24) -> List[Dict[str, Any]]:
        """Get drawdown history for specified hours."""
        cutoff_time = datetime.now() - timedelta(hours=hours)
        
        recent_history = []
        for record in self.drawdown_history:
            record_time = datetime.fromisoformat(record['timestamp'])
            if record_time >= cutoff_time:
                recent_history.append(record)
        
        return recent_history
    
    def check_recovery(self, current_value: float) -> bool:
        """Check if portfolio has recovered from drawdown."""
        if self.current_drawdown == 0:
            return True
        
        # Check if current value is close to peak
        recovery_threshold = 0.95  # 95% of peak value
        if current_value >= self.peak_value * recovery_threshold:
            logger.info(f"Portfolio recovered: {current_value:.2f} >= {self.peak_value * recovery_threshold:.2f}")
            return True
        
        return False
    
    def adjust_limit(self, new_limit: float):
        """Adjust drawdown limit."""
        if not (0 < new_limit <= 1):
            raise ValueError("Drawdown limit must be between 0 and 1")
        
        old_limit = self.max_drawdown_pct
        self.max_drawdown_pct = new_limit
        
        logger.info(f"Drawdown limit adjusted: {old_limit:.1%} -> {new_limit:.1%}")
    
    def get_risk_metrics(self) -> Dict[str, Any]:
        """Get comprehensive risk metrics."""
        stats = self.get_drawdown_stats()
        
        # Calculate additional metrics
        if self.drawdown_history:
            # Calculate drawdown duration
            drawdown_durations = []
            in_drawdown = False
            drawdown_start = None
            
            for record in self.drawdown_history:
                if record['drawdown'] > 0:
                    if not in_drawdown:
                        in_drawdown = True
                        drawdown_start = datetime.fromisoformat(record['timestamp'])
                else:
                    if in_drawdown:
                        in_drawdown = False
                        if drawdown_start:
                            duration = datetime.fromisoformat(record['timestamp']) - drawdown_start
                            drawdown_durations.append(duration.total_seconds() / 3600)  # hours
            
            # Calculate average drawdown duration
            avg_drawdown_duration = np.mean(drawdown_durations) if drawdown_durations else 0.0
        else:
            avg_drawdown_duration = 0.0
        
        # Calculate risk score (0-100)
        risk_score = min(100, (self.current_drawdown / self.max_drawdown_pct) * 100)
        
        metrics = {
            **stats,
            'avg_drawdown_duration_hours': avg_drawdown_duration,
            'risk_score': risk_score,
            'risk_level': self._get_risk_level(risk_score),
            'max_drawdown_limit': self.max_drawdown_pct
        }
        
        return metrics
    
    def _get_risk_level(self, risk_score: float) -> str:
        """Get risk level based on score."""
        if risk_score < 25:
            return 'low'
        elif risk_score < 50:
            return 'medium'
        elif risk_score < 75:
            return 'high'
        else:
            return 'critical'
    
    def export_drawdown_data(self, filepath: str):
        """Export drawdown data to file."""
        import json
        
        # Create directory if it doesn't exist
        from pathlib import Path
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        
        # Export data
        export_data = {
            'max_drawdown_limit': self.max_drawdown_pct,
            'current_stats': self.get_drawdown_stats(),
            'risk_metrics': self.get_risk_metrics(),
            'drawdown_history': self.drawdown_history,
            'export_timestamp': datetime.now().isoformat()
        }
        
        with open(filepath, 'w') as f:
            json.dump(export_data, f, indent=2)
        
        logger.info(f"Drawdown data exported to {filepath}")