#!/bin/bash

# SB1 ALPHA Parallel Training and Trading Script

set -e

# Configuration
SYMBOL=${SYMBOL:-XAUUSD}
TIMEFRAME=${TIMEFRAME:-1h}
BROKER=${BROKER:-paper}
CONFIDENCE_THRESHOLD=${CONFIDENCE_THRESHOLD:-0.6}

echo "🚀 Starting SB1 ALPHA parallel training and trading..."
echo "Symbol: $SYMBOL"
echo "Timeframe: $TIMEFRAME"
echo "Broker: $BROKER"
echo "Confidence Threshold: $CONFIDENCE_THRESHOLD"

# Activate virtual environment
source venv/bin/activate

# Create PID file
PID_FILE="runtime/sb1_alpha.pid"
echo $$ > $PID_FILE

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down SB1 ALPHA..."
    if [ -f "$PID_FILE" ]; then
        rm -f "$PID_FILE"
    fi
    # Kill background processes
    jobs -p | xargs -r kill
    exit 0
}

# Set up signal handlers
trap cleanup SIGINT SIGTERM

# Start API server in background
echo "🌐 Starting API server..."
cd apps/api
npm run dev &
API_PID=$!
cd ../..

# Wait for API to start
sleep 5

# Check if API is running
if ! curl -s http://localhost:3001/health > /dev/null; then
    echo "❌ API server failed to start"
    exit 1
fi

echo "✅ API server started (PID: $API_PID)"

# Start trading engine in background
echo "📈 Starting trading engine..."
python -m core.strategies.ml_runner --symbol $SYMBOL --timeframe $TIMEFRAME --broker $BROKER --confidence-threshold $CONFIDENCE_THRESHOLD &
TRADING_PID=$!

echo "✅ Trading engine started (PID: $TRADING_PID)"

# Training loop
echo "🧠 Starting continuous training loop..."
while true; do
    echo "🔄 Starting model retraining..."
    
    # Calculate date range for training
    END_DATE=$(date +%Y-%m-%d)
    START_DATE=$(date -d "30 days ago" +%Y-%m-%d)
    
    # Train ML model
    echo "📊 Training ML model..."
    python -m core.ml.train \
        --symbol $SYMBOL \
        --timeframe $TIMEFRAME \
        --start-date $START_DATE \
        --end-date $END_DATE \
        --config configs/ml.yaml
    
    # Train RL model
    echo "🤖 Training RL model..."
    python -m core.rl.train_rl \
        --symbol $SYMBOL \
        --timeframe $TIMEFRAME \
        --start-date $START_DATE \
        --end-date $END_DATE \
        --config configs/rl.yaml
    
    # Validate models
    echo "✅ Validating models..."
    python -m core.ml.validate_models --symbol $SYMBOL --timeframe $TIMEFRAME
    
    # Check if new model is better
    echo "📊 Evaluating model performance..."
    python -m core.ml.evaluate_model --symbol $SYMBOL --timeframe $TIMEFRAME
    
    # Send Telegram notification
    if [ ! -z "$TELEGRAM_BOT_TOKEN" ] && [ ! -z "$TELEGRAM_CHAT_ID" ]; then
        curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
            -d "chat_id=$TELEGRAM_CHAT_ID" \
            -d "text=🧠 SB1 ALPHA: Model retraining completed for $SYMBOL $TIMEFRAME"
    fi
    
    # Wait before next training cycle
    echo "⏰ Waiting for next training cycle..."
    sleep 3600  # 1 hour
done