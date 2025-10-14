#!/usr/bin/env python3
"""
SB1 ALPHA - One-Click Run Script
"""
import os
import sys
import subprocess
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
        return False

def main():
    """Main run function."""
    print("🚀 SB1 ALPHA - One-Click Run")
    print("=" * 40)
    
    # Check if we're in the right directory
    if not Path('core').exists():
        print("❌ Please run this script from the sb1-alpha directory")
        return 1
    
    # Check if virtual environment exists
    if not Path('venv').exists():
        print("📦 Setting up virtual environment...")
        if not run_command('python -m venv venv', 'Creating virtual environment'):
            return 1
    
    # Determine activation script based on OS
    if os.name == 'nt':  # Windows
        activate_script = 'venv\\Scripts\\activate'
        python_command = 'venv\\Scripts\\python'
    else:  # Unix/Linux/Mac
        activate_script = 'venv/bin/activate'
        python_command = 'venv/bin/python'
    
    # Install dependencies if needed
    if not Path('venv/lib/python3.8/site-packages/numpy').exists() and not Path('venv/lib/python3.9/site-packages/numpy').exists():
        print("📦 Installing dependencies...")
        if not run_command(f'{python_command} -m pip install --upgrade pip', 'Upgrading pip'):
            return 1
        if not run_command(f'{python_command} -m pip install -r requirements.txt', 'Installing requirements'):
            return 1
    
    # Run quick start
    print("🚀 Running quick start demo...")
    if not run_command(f'{python_command} quick_start.py', 'Quick start demo'):
        return 1
    
    print("\n" + "=" * 40)
    print("🎉 SB1 ALPHA is ready!")
    print("\n📋 Available Commands:")
    print("1. python quick_start.py - Quick demo")
    print("2. python test_system.py - Full system test")
    print("3. python demo.py - Interactive demo")
    print("4. python -m core.strategies.ml_runner --symbol XAUUSD --timeframe 1h --broker paper")
    print("5. python -m core.backtest.engine --strategy ema --fast 5 --slow 20")
    print("\n🔗 Full Documentation: README.md")
    
    return 0

if __name__ == "__main__":
    exit(main())