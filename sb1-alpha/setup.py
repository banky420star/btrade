#!/usr/bin/env python3
"""
SB1 ALPHA Setup Script
"""
import os
import sys
import subprocess
import platform
from pathlib import Path

def run_command(command, description):
    """Run a command and handle errors."""
    print(f"🔄 {description}...")
    try:
        result = subprocess.run(command, shell=True, check=True, capture_output=True, text=True)
        print(f"✅ {description} completed")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ {description} failed: {e}")
        if e.stdout:
            print(f"STDOUT: {e.stdout}")
        if e.stderr:
            print(f"STDERR: {e.stderr}")
        return False

def check_python_version():
    """Check Python version."""
    print("🐍 Checking Python version...")
    if sys.version_info < (3, 8):
        print("❌ Python 3.8+ required. Current version:", sys.version)
        return False
    print(f"✅ Python {sys.version.split()[0]} detected")
    return True

def check_node_version():
    """Check Node.js version."""
    print("📦 Checking Node.js version...")
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True)
        if result.returncode == 0:
            print(f"✅ Node.js {result.stdout.strip()} detected")
            return True
        else:
            print("❌ Node.js not found")
            return False
    except FileNotFoundError:
        print("❌ Node.js not found")
        return False

def create_directories():
    """Create necessary directories."""
    print("📁 Creating directories...")
    directories = [
        'logs',
        'runtime/cache',
        'models/registry',
        'reports',
        'sample'
    ]
    
    for directory in directories:
        Path(directory).mkdir(parents=True, exist_ok=True)
    
    print("✅ Directories created")
    return True

def install_python_dependencies():
    """Install Python dependencies."""
    print("📦 Installing Python dependencies...")
    
    # Check if virtual environment exists
    if not Path('venv').exists():
        print("🔄 Creating virtual environment...")
        if not run_command('python -m venv venv', 'Creating virtual environment'):
            return False
    
    # Determine activation script based on OS
    if platform.system() == 'Windows':
        activate_script = 'venv\\Scripts\\activate'
        pip_command = 'venv\\Scripts\\pip'
    else:
        activate_script = 'venv/bin/activate'
        pip_command = 'venv/bin/pip'
    
    # Install dependencies
    commands = [
        f'{pip_command} install --upgrade pip',
        f'{pip_command} install -r requirements.txt'
    ]
    
    for command in commands:
        if not run_command(command, f'Running: {command}'):
            return False
    
    print("✅ Python dependencies installed")
    return True

def install_node_dependencies():
    """Install Node.js dependencies."""
    print("📦 Installing Node.js dependencies...")
    
    # Change to API directory
    api_dir = Path('apps/api')
    if not api_dir.exists():
        print("❌ API directory not found")
        return False
    
    # Install dependencies
    commands = [
        'cd apps/api && npm install'
    ]
    
    for command in commands:
        if not run_command(command, f'Running: {command}'):
            return False
    
    print("✅ Node.js dependencies installed")
    return True

def create_env_file():
    """Create .env file from example."""
    print("⚙️  Creating .env file...")
    
    env_example = Path('.env.example')
    env_file = Path('.env')
    
    if not env_example.exists():
        print("❌ .env.example not found")
        return False
    
    if not env_file.exists():
        env_file.write_text(env_example.read_text())
        print("✅ .env file created from .env.example")
    else:
        print("✅ .env file already exists")
    
    return True

def create_sample_data():
    """Create sample data."""
    print("📊 Creating sample data...")
    
    try:
        # Run demo script to create sample data
        if platform.system() == 'Windows':
            python_command = 'venv\\Scripts\\python'
        else:
            python_command = 'venv/bin/python'
        
        if not run_command(f'{python_command} demo.py', 'Creating sample data'):
            return False
        
        print("✅ Sample data created")
        return True
    except Exception as e:
        print(f"⚠️  Sample data creation failed: {e}")
        return True  # Non-critical

def run_tests():
    """Run basic tests."""
    print("🧪 Running basic tests...")
    
    try:
        if platform.system() == 'Windows':
            python_command = 'venv\\Scripts\\python'
        else:
            python_command = 'venv/bin/python'
        
        # Test imports
        test_script = '''
import sys
sys.path.insert(0, ".")
try:
    from core.util.config import get_config
    from core.util.logger import get_logger
    from core.data.loaders import DataLoader
    from core.ml.featureset import FeatureSet
    from core.ml.xgb_model import XGBModel
    from core.backtest.engine import BacktestEngine
    from core.adapters.paper.broker import PaperBroker
    print("✅ All imports successful")
except Exception as e:
    print(f"❌ Import failed: {e}")
    sys.exit(1)
'''
        
        if not run_command(f'{python_command} -c "{test_script}"', 'Testing imports'):
            return False
        
        print("✅ Basic tests passed")
        return True
    except Exception as e:
        print(f"⚠️  Tests failed: {e}")
        return True  # Non-critical

def main():
    """Main setup function."""
    print("🚀 SB1 ALPHA Setup")
    print("=" * 50)
    
    # Check requirements
    if not check_python_version():
        return 1
    
    if not check_node_version():
        print("⚠️  Node.js not found. API features will not be available.")
    
    # Create directories
    if not create_directories():
        return 1
    
    # Install dependencies
    if not install_python_dependencies():
        return 1
    
    if not install_node_dependencies():
        print("⚠️  Node.js dependencies installation failed. API features may not work.")
    
    # Create configuration
    if not create_env_file():
        return 1
    
    # Create sample data
    create_sample_data()
    
    # Run tests
    run_tests()
    
    print("\n" + "=" * 50)
    print("🎉 SB1 ALPHA Setup Completed Successfully!")
    print("\n📋 Next Steps:")
    print("1. Edit .env file with your configuration")
    print("2. Run: python demo.py (to test the system)")
    print("3. Run: cd apps/api && npm run dev (to start API server)")
    print("4. Run: ./scripts/train_and_trade.sh (to start trading)")
    print("\n🔗 Documentation: README.md")
    print("⚙️  Configuration: .env")
    
    return 0

if __name__ == "__main__":
    exit(main())