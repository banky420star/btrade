#!/bin/bash

# SB1 ALPHA Development Setup Script

set -e

echo "🚀 Setting up SB1 ALPHA development environment..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    exit 1
fi

# Create virtual environment
echo "📦 Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
echo "📦 Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Install API dependencies
echo "📦 Installing API dependencies..."
cd apps/api
npm install
cd ../..

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p logs
mkdir -p runtime/cache
mkdir -p models/registry
mkdir -p reports

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  Please edit .env file with your configuration"
fi

# Set up logging
echo "📝 Setting up logging..."
touch logs/sb1_alpha.log
touch logs/api-error.log
touch logs/api-combined.log
touch logs/trades.csv

# Make scripts executable
chmod +x scripts/*.sh

echo "✅ Development environment setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Run: source venv/bin/activate"
echo "3. Run: python -m core.ml.train --symbol XAUUSD --timeframe 1h --start-date 2024-01-01 --end-date 2024-01-31"
echo "4. Run: cd apps/api && npm run dev"
echo ""
echo "Happy trading! 🎯"