import { Router, Request, Response } from 'express';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';

const router = Router();

interface Trade {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  size: number;
  price: number;
  timestamp: string;
  pnl?: number;
  status: 'open' | 'closed' | 'cancelled';
}

interface TradeSummary {
  total_trades: number;
  open_trades: number;
  closed_trades: number;
  total_pnl: number;
  win_rate: number;
  avg_trade_duration: number;
  last_trade_time: string;
}

// Get recent trades
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    
    // Read trades from log file
    const tradesLogPath = join(process.cwd(), '..', '..', 'logs', 'trades.csv');
    
    let trades: Trade[] = [];
    
    try {
      const logContent = await readFile(tradesLogPath, 'utf-8');
      const lines = logContent.trim().split('\n');
      
      // Skip header if present
      const dataLines = lines[0].includes('id,symbol,side') ? lines.slice(1) : lines;
      
      trades = dataLines
        .filter(line => line.trim())
        .map(line => {
          const [id, symbol, side, size, price, timestamp, pnl, status] = line.split(',');
          return {
            id,
            symbol,
            side: side as 'buy' | 'sell',
            size: parseFloat(size),
            price: parseFloat(price),
            timestamp,
            pnl: pnl ? parseFloat(pnl) : undefined,
            status: (status || 'open') as 'open' | 'closed' | 'cancelled'
          };
        })
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(offset, offset + limit);
        
    } catch (error) {
      // If trades log doesn't exist, return empty array
      trades = [];
    }
    
    res.json({
      trades,
      pagination: {
        limit,
        offset,
        total: trades.length
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch trades',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get trade summary
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const tradesLogPath = join(process.cwd(), '..', '..', 'logs', 'trades.csv');
    
    let trades: Trade[] = [];
    
    try {
      const logContent = await readFile(tradesLogPath, 'utf-8');
      const lines = logContent.trim().split('\n');
      const dataLines = lines[0].includes('id,symbol,side') ? lines.slice(1) : lines;
      
      trades = dataLines
        .filter(line => line.trim())
        .map(line => {
          const [id, symbol, side, size, price, timestamp, pnl, status] = line.split(',');
          return {
            id,
            symbol,
            side: side as 'buy' | 'sell',
            size: parseFloat(size),
            price: parseFloat(price),
            timestamp,
            pnl: pnl ? parseFloat(pnl) : undefined,
            status: (status || 'open') as 'open' | 'closed' | 'cancelled'
          };
        });
    } catch (error) {
      trades = [];
    }
    
    const closedTrades = trades.filter(t => t.status === 'closed');
    const openTrades = trades.filter(t => t.status === 'open');
    
    const totalPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnl || 0), 0);
    const winningTrades = closedTrades.filter(trade => (trade.pnl || 0) > 0);
    const winRate = closedTrades.length > 0 ? winningTrades.length / closedTrades.length : 0;
    
    const lastTradeTime = trades.length > 0 
      ? trades.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0].timestamp
      : 'never';
    
    const summary: TradeSummary = {
      total_trades: trades.length,
      open_trades: openTrades.length,
      closed_trades: closedTrades.length,
      total_pnl: totalPnl,
      win_rate: winRate,
      avg_trade_duration: 0, // TODO: Calculate from trade data
      last_trade_time: lastTradeTime
    };
    
    res.json(summary);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch trade summary',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Get specific trade by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tradeId = req.params.id;
    const tradesLogPath = join(process.cwd(), '..', '..', 'logs', 'trades.csv');
    
    try {
      const logContent = await readFile(tradesLogPath, 'utf-8');
      const lines = logContent.trim().split('\n');
      const dataLines = lines[0].includes('id,symbol,side') ? lines.slice(1) : lines;
      
      const trade = dataLines
        .filter(line => line.trim())
        .map(line => {
          const [id, symbol, side, size, price, timestamp, pnl, status] = line.split(',');
          return {
            id,
            symbol,
            side: side as 'buy' | 'sell',
            size: parseFloat(size),
            price: parseFloat(price),
            timestamp,
            pnl: pnl ? parseFloat(pnl) : undefined,
            status: (status || 'open') as 'open' | 'closed' | 'cancelled'
          };
        })
        .find(t => t.id === tradeId);
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }
      
      res.json(trade);
    } catch (error) {
      res.status(404).json({ error: 'Trade not found' });
    }
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch trade',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export { router as tradesRouter };