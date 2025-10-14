import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const router = Router();

interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  system: {
    uptime: number;
    memory: NodeJS.MemoryUsage;
    platform: string;
    node_version: string;
  };
  trading: {
    is_running: boolean;
    mode: string;
    emergency_stop: boolean;
    last_update: string;
  };
  models: {
    ml_status: string;
    rl_status: string;
    last_training: string;
  };
  data: {
    last_update: string;
    connection_status: string;
  };
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const startTime = process.hrtime();
    
    // Get system information
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const platform = process.platform;
    const nodeVersion = process.version;
    
    // Check Python processes (trading system)
    let mlStatus = 'unknown';
    let rlStatus = 'unknown';
    let lastTraining = 'never';
    
    try {
      const { stdout: mlProcesses } = await execAsync('pgrep -f "core.ml" | wc -l');
      mlStatus = parseInt(mlProcesses.trim()) > 0 ? 'running' : 'stopped';
    } catch (error) {
      mlStatus = 'error';
    }
    
    try {
      const { stdout: rlProcesses } = await execAsync('pgrep -f "core.rl" | wc -l');
      rlStatus = parseInt(rlProcesses.trim()) > 0 ? 'running' : 'stopped';
    } catch (error) {
      rlStatus = 'error';
    }
    
    // Check last training time
    try {
      const { stdout: lastTrainingTime } = await execAsync('find models/registry -name "*.joblib" -o -name "*.h5" | xargs ls -t | head -1 | xargs stat -c %Y 2>/dev/null || echo 0');
      const timestamp = parseInt(lastTrainingTime.trim());
      if (timestamp > 0) {
        lastTraining = new Date(timestamp * 1000).toISOString();
      }
    } catch (error) {
      // Ignore error, keep default
    }
    
    // Check data connection
    let dataStatus = 'unknown';
    try {
      // Simple ping test to check network connectivity
      await execAsync('ping -c 1 8.8.8.8 > /dev/null 2>&1');
      dataStatus = 'connected';
    } catch (error) {
      dataStatus = 'disconnected';
    }
    
    const responseTime = process.hrtime(startTime);
    const responseTimeMs = responseTime[0] * 1000 + responseTime[1] / 1000000;
    
    const healthStatus: HealthStatus = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      system: {
        uptime,
        memory,
        platform,
        node_version: nodeVersion
      },
      trading: {
        is_running: process.env.BROKER !== 'disabled',
        mode: process.env.BROKER || 'paper',
        emergency_stop: false,
        last_update: new Date().toISOString()
      },
      models: {
        ml_status: mlStatus,
        rl_status: rlStatus,
        last_training: lastTraining
      },
      data: {
        last_update: new Date().toISOString(),
        connection_status: dataStatus
      }
    };
    
    // Add response time to headers
    res.set('X-Response-Time', `${responseTimeMs.toFixed(2)}ms`);
    
    res.json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

router.get('/ready', (req: Request, res: Response) => {
  // Simple readiness check
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
});

router.get('/live', (req: Request, res: Response) => {
  // Liveness check
  res.json({ status: 'alive', timestamp: new Date().toISOString() });
});

export { router as healthRouter };