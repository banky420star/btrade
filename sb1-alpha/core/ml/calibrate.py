"""
Model calibration with data integrity validation.
"""
import numpy as np
import pandas as pd
from typing import Tuple, Optional, Dict, Any, List
from sklearn.calibration import CalibratedClassifierCV, calibration_curve
from sklearn.metrics import brier_score_loss, log_loss
import matplotlib.pyplot as plt
from pathlib import Path
from core.util.logger import get_logger
from core.util.config import get_config

logger = get_logger(__name__)

class ModelCalibrator:
    """Model calibration with data integrity validation."""
    
    def __init__(self, method: str = 'isotonic', cv: int = 3):
        self.method = method
        self.cv = cv
        self.calibrator = None
        self.calibration_metrics = {}
    
    def calibrate(self, model, X: pd.DataFrame, y: pd.Series) -> CalibratedClassifierCV:
        """Calibrate model with data integrity validation."""
        # Validate inputs
        self._validate_calibration_data(X, y)
        
        # Create calibrator
        self.calibrator = CalibratedClassifierCV(model, method=self.method, cv=self.cv)
        
        # Fit calibrator
        self.calibrator.fit(X, y)
        
        # Evaluate calibration
        self.calibration_metrics = self._evaluate_calibration(X, y)
        
        logger.info(f"Model calibrated using {self.method} method")
        logger.info(f"Calibration metrics: {self.calibration_metrics}")
        
        return self.calibrator
    
    def _validate_calibration_data(self, X: pd.DataFrame, y: pd.Series):
        """Validate calibration data integrity."""
        # Check data types
        if not isinstance(X, pd.DataFrame):
            raise ValueError("X must be a pandas DataFrame")
        if not isinstance(y, pd.Series):
            raise ValueError("y must be a pandas Series")
        
        # Check dimensions
        if len(X) != len(y):
            raise ValueError("X and y must have the same length")
        
        # Check for NaN values
        if X.isnull().any().any():
            raise ValueError("X contains NaN values")
        if y.isnull().any():
            raise ValueError("y contains NaN values")
        
        # Check for infinite values
        if np.isinf(X.select_dtypes(include=[np.number])).any().any():
            raise ValueError("X contains infinite values")
        if np.isinf(y).any():
            raise ValueError("y contains infinite values")
        
        # Check target distribution
        unique_labels = y.unique()
        if len(unique_labels) < 2:
            raise ValueError("y must have at least 2 unique labels")
        
        logger.info(f"Calibration data validation passed: {X.shape[0]} samples")
    
    def _evaluate_calibration(self, X: pd.DataFrame, y: pd.Series) -> Dict[str, float]:
        """Evaluate calibration quality."""
        if self.calibrator is None:
            raise ValueError("Calibrator not fitted")
        
        # Get predictions
        y_pred_proba = self.calibrator.predict_proba(X)[:, 1]
        
        # Calculate calibration metrics
        brier_score = brier_score_loss(y, y_pred_proba)
        log_loss_score = log_loss(y, y_pred_proba)
        
        # Calculate calibration curve
        fraction_of_positives, mean_predicted_value = calibration_curve(
            y, y_pred_proba, n_bins=10
        )
        
        # Calculate reliability diagram metrics
        reliability_diagram = {
            'fraction_of_positives': fraction_of_positives.tolist(),
            'mean_predicted_value': mean_predicted_value.tolist()
        }
        
        return {
            'brier_score': brier_score,
            'log_loss': log_loss_score,
            'reliability_diagram': reliability_diagram
        }
    
    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """Make calibrated probability predictions."""
        if self.calibrator is None:
            raise ValueError("Calibrator not fitted")
        
        # Validate input
        self._validate_prediction_data(X)
        
        return self.calibrator.predict_proba(X)
    
    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """Make calibrated predictions."""
        if self.calibrator is None:
            raise ValueError("Calibrator not fitted")
        
        # Validate input
        self._validate_prediction_data(X)
        
        return self.calibrator.predict(X)
    
    def _validate_prediction_data(self, X: pd.DataFrame):
        """Validate prediction data integrity."""
        # Check data type
        if not isinstance(X, pd.DataFrame):
            raise ValueError("X must be a pandas DataFrame")
        
        # Check for NaN values
        if X.isnull().any().any():
            raise ValueError("X contains NaN values")
        
        # Check for infinite values
        if np.isinf(X.select_dtypes(include=[np.number])).any().any():
            raise ValueError("X contains infinite values")
    
    def plot_calibration_curve(self, X: pd.DataFrame, y: pd.Series, 
                              save_path: Optional[str] = None):
        """Plot calibration curve."""
        if self.calibrator is None:
            raise ValueError("Calibrator not fitted")
        
        # Get predictions
        y_pred_proba = self.calibrator.predict_proba(X)[:, 1]
        
        # Calculate calibration curve
        fraction_of_positives, mean_predicted_value = calibration_curve(
            y, y_pred_proba, n_bins=10
        )
        
        # Create plot
        plt.figure(figsize=(10, 8))
        
        # Plot calibration curve
        plt.subplot(2, 2, 1)
        plt.plot(mean_predicted_value, fraction_of_positives, "s-", label="Calibrated")
        plt.plot([0, 1], [0, 1], "k:", label="Perfectly calibrated")
        plt.xlabel("Mean predicted probability")
        plt.ylabel("Fraction of positives")
        plt.title("Calibration Curve")
        plt.legend()
        plt.grid(True)
        
        # Plot reliability diagram
        plt.subplot(2, 2, 2)
        plt.bar(mean_predicted_value, fraction_of_positives - mean_predicted_value, 
                width=0.1, alpha=0.7, label="Calibration error")
        plt.axhline(y=0, color='k', linestyle='-')
        plt.xlabel("Mean predicted probability")
        plt.ylabel("Fraction of positives - Mean predicted probability")
        plt.title("Reliability Diagram")
        plt.legend()
        plt.grid(True)
        
        # Plot probability distribution
        plt.subplot(2, 2, 3)
        plt.hist(y_pred_proba, bins=20, alpha=0.7, label="Predicted probabilities")
        plt.xlabel("Predicted probability")
        plt.ylabel("Frequency")
        plt.title("Probability Distribution")
        plt.legend()
        plt.grid(True)
        
        # Plot confidence vs accuracy
        plt.subplot(2, 2, 4)
        confidence_bins = np.linspace(0, 1, 11)
        bin_accuracies = []
        bin_confidences = []
        
        for i in range(len(confidence_bins) - 1):
            mask = (y_pred_proba >= confidence_bins[i]) & (y_pred_proba < confidence_bins[i + 1])
            if mask.sum() > 0:
                bin_accuracies.append(y[mask].mean())
                bin_confidences.append(y_pred_proba[mask].mean())
        
        plt.plot(bin_confidences, bin_accuracies, "o-", label="Confidence vs Accuracy")
        plt.plot([0, 1], [0, 1], "k:", label="Perfect calibration")
        plt.xlabel("Mean confidence")
        plt.ylabel("Accuracy")
        plt.title("Confidence vs Accuracy")
        plt.legend()
        plt.grid(True)
        
        plt.tight_layout()
        
        if save_path:
            plt.savefig(save_path, dpi=300, bbox_inches='tight')
            logger.info(f"Calibration curve saved to {save_path}")
        
        plt.show()
    
    def get_calibration_metrics(self) -> Dict[str, Any]:
        """Get calibration metrics."""
        return self.calibration_metrics
    
    def save_calibrator(self, filepath: str):
        """Save calibrated model."""
        if self.calibrator is None:
            raise ValueError("Calibrator not fitted")
        
        # Create directory if it doesn't exist
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        
        # Save calibrator
        import joblib
        joblib.dump(self.calibrator, filepath)
        
        # Save calibration metrics
        metrics_file = filepath.replace('.joblib', '_calibration_metrics.json')
        import json
        with open(metrics_file, 'w') as f:
            json.dump(self.calibration_metrics, f, indent=2)
        
        logger.info(f"Calibrated model saved to {filepath}")
    
    def load_calibrator(self, filepath: str):
        """Load calibrated model."""
        if not Path(filepath).exists():
            raise FileNotFoundError(f"Calibrator file not found: {filepath}")
        
        # Load calibrator
        import joblib
        self.calibrator = joblib.load(filepath)
        
        # Load calibration metrics
        metrics_file = filepath.replace('.joblib', '_calibration_metrics.json')
        if Path(metrics_file).exists():
            import json
            with open(metrics_file, 'r') as f:
                self.calibration_metrics = json.load(f)
        
        logger.info(f"Calibrated model loaded from {filepath}")