import axios from 'axios';

interface TelegramMessage {
  chat_id: string;
  text: string;
  parse_mode?: 'HTML' | 'Markdown';
  disable_web_page_preview?: boolean;
}

class TelegramService {
  private botToken: string;
  private chatId: string;
  private baseUrl: string;

  constructor() {
    this.botToken = process.env.TELEGRAM_BOT_TOKEN || '';
    this.chatId = process.env.TELEGRAM_CHAT_ID || '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async sendMessage(text: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
    if (!this.botToken || !this.chatId) {
      console.warn('Telegram not configured - skipping message');
      return false;
    }

    try {
      const message: TelegramMessage = {
        chat_id: this.chatId,
        text,
        parse_mode: parseMode,
        disable_web_page_preview: true
      };

      const response = await axios.post(`${this.baseUrl}/sendMessage`, message, {
        timeout: 5000
      });

      return response.status === 200;
    } catch (error) {
      console.error('Failed to send Telegram message:', error);
      return false;
    }
  }

  async sendTradeAlert(trade: {
    symbol: string;
    side: 'buy' | 'sell';
    size: number;
    price: number;
    pnl?: number;
  }): Promise<boolean> {
    const emoji = trade.side === 'buy' ? '🟢' : '🔴';
    const pnlText = trade.pnl !== undefined ? `\n💰 P&L: ${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '';
    
    const message = `${emoji} <b>Trade Executed</b>
📊 ${trade.symbol} ${trade.side.toUpperCase()}
📈 Size: ${trade.size}
💵 Price: ${trade.price}${pnlText}
⏰ ${new Date().toLocaleString()}`;

    return await this.sendMessage(message);
  }

  async sendModelUpdate(model: {
    name: string;
    accuracy: number;
    performance: number;
    status: 'trained' | 'deployed' | 'failed';
  }): Promise<boolean> {
    const emoji = model.status === 'deployed' ? '🚀' : 
                  model.status === 'trained' ? '✅' : '❌';
    
    const message = `${emoji} <b>Model Update</b>
🤖 ${model.name}
📊 Accuracy: ${model.accuracy.toFixed(2)}%
📈 Performance: ${model.performance.toFixed(2)}%
🔄 Status: ${model.status.toUpperCase()}
⏰ ${new Date().toLocaleString()}`;

    return await this.sendMessage(message);
  }

  async sendErrorAlert(error: {
    component: string;
    message: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }): Promise<boolean> {
    const emoji = error.severity === 'critical' ? '🚨' :
                  error.severity === 'high' ? '⚠️' :
                  error.severity === 'medium' ? '⚡' : 'ℹ️';
    
    const message = `${emoji} <b>System Alert</b>
🔧 Component: ${error.component}
📝 Message: ${error.message}
⚠️ Severity: ${error.severity.toUpperCase()}
⏰ ${new Date().toLocaleString()}`;

    return await this.sendMessage(message);
  }

  async sendPerformanceReport(report: {
    period: string;
    totalPnl: number;
    winRate: number;
    sharpeRatio: number;
    maxDrawdown: number;
    totalTrades: number;
  }): Promise<boolean> {
    const pnlEmoji = report.totalPnl >= 0 ? '📈' : '📉';
    
    const message = `${pnlEmoji} <b>Performance Report</b>
📅 Period: ${report.period}
💰 Total P&L: ${report.totalPnl >= 0 ? '+' : ''}$${report.totalPnl.toFixed(2)}
🎯 Win Rate: ${(report.winRate * 100).toFixed(1)}%
📊 Sharpe Ratio: ${report.sharpeRatio.toFixed(2)}
📉 Max Drawdown: ${(report.maxDrawdown * 100).toFixed(1)}%
🔄 Total Trades: ${report.totalTrades}
⏰ ${new Date().toLocaleString()}`;

    return await this.sendMessage(message);
  }

  async sendSystemStatus(status: {
    isRunning: boolean;
    mode: string;
    activeModels: number;
    openPositions: number;
    balance: number;
  }): Promise<boolean> {
    const statusEmoji = status.isRunning ? '🟢' : '🔴';
    
    const message = `${statusEmoji} <b>System Status</b>
🔄 Running: ${status.isRunning ? 'YES' : 'NO'}
🎛️ Mode: ${status.mode.toUpperCase()}
🤖 Active Models: ${status.activeModels}
📊 Open Positions: ${status.openPositions}
💰 Balance: $${status.balance.toFixed(2)}
⏰ ${new Date().toLocaleString()}`;

    return await this.sendMessage(message);
  }

  async testConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/getMe`, {
        timeout: 5000
      });
      
      if (response.status === 200) {
        await this.sendMessage('🤖 SB1 ALPHA: Telegram connection test successful');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Telegram connection test failed:', error);
      return false;
    }
  }
}

export const telegramService = new TelegramService();