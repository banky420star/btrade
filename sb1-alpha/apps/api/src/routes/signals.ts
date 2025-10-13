import { Router, Request, Response } from 'express';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const router = Router();

interface Signal {
  id: string;
  symbol: string;
  signal: 'buy' | 'sell' | 'hold';
  confidence: number;
  model: 'ml' | 'rl' | 'ema';
  timestamp: string;
  price: number;
  metadata?: Record<string, any>;
}

// Get recent signals
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const model = req.query.model as string;
    const symbol = req.query.symbol as string;
    
    const signalsPath = join(process.cwd(), '..', '..', 'runtime', 'signal_fifo.jsonl');
    
    let signals: Signal[] = [];
    
    try {
      const signalsContent = await readFile(signalsPath, 'utf-8');
      const lines = signalsContent.trim().split('\n').filter(line => line.trim());
      
      signals = lines
        .map(line => JSON.parse(line))
        .filter(signal => {
          if (model && signal.model !== model) return false;
          if (symbol && signal.symbol !== symbol) return false;
          return true;
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
        
    } catch (error) {
      // If signals file doesn't exist, return empty array
      signals = [];
    }
    
    res.json({
      signals,
      count: signals.length,
      filters: { model, symbol }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch signals',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Submit new signal
router.post('/', async (req: Request, res: Response) => {
  try {
    const signal: Signal = {
      id: `signal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol: req.body.symbol || 'XAUUSD',
      signal: req.body.signal || 'hold',
      confidence: req.body.confidence || 0.5,
      model: req.body.model || 'ml',
      timestamp: new Date().toISOString(),
      price: req.body.price || 0,
      metadata: req.body.metadata || {}
    };
    
    // Validate signal
    if (!['buy', 'sell', 'hold'].includes(signal.signal)) {
      return res.status(400).json({ error: 'Invalid signal type' });
    }
    
    if (signal.confidence < 0 || signal.confidence > 1) {
      return res.status(400).json({ error: 'Confidence must be between 0 and 1' });
    }
    
    // Append to signals file
    const signalsPath = join(process.cwd(), '..', '..', 'runtime', 'signal_fifo.jsonl');
    const signalLine = JSON.stringify(signal) + '\n';
    
    try {
      await writeFile(signalsPath, signalLine, { flag: 'a' });
    } catch (error) {
      // Create directory if it doesn't exist
      const { mkdir } = await import('fs/promises');
      await mkdir(join(process.cwd(), '..', '..', 'runtime'), { recursive: true });
      await writeFile(signalsPath, signalLine, { flag: 'a' });
    }
    
    res.status(201).json({
      message: 'Signal submitted successfully',
      signal
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to submit signal',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get signal statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const signalsPath = join(process.cwd(), '..', '..', 'runtime', 'signal_fifo.jsonl');
    
    let signals: Signal[] = [];
    
    try {
      const signalsContent = await readFile(signalsPath, 'utf-8');
      const lines = signalsContent.trim().split('\n').filter(line => line.trim());
      
      signals = lines.map(line => JSON.parse(line));
    } catch (error) {
      signals = [];
    }
    
    const stats = {
      total_signals: signals.length,
      by_model: {
        ml: signals.filter(s => s.model === 'ml').length,
        rl: signals.filter(s => s.model === 'rl').length,
        ema: signals.filter(s => s.model === 'ema').length
      },
      by_signal: {
        buy: signals.filter(s => s.signal === 'buy').length,
        sell: signals.filter(s => s.signal === 'sell').length,
        hold: signals.filter(s => s.signal === 'hold').length
      },
      avg_confidence: signals.length > 0 
        ? signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length 
        : 0,
      last_signal_time: signals.length > 0 
        ? signals.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].timestamp
        : 'never'
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch signal statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as signalsRouter };