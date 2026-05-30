import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import dotenv from 'dotenv';

dotenv.config();

// Auto-install FFmpeg on Linux if missing
try {
  const { execSync } = require('child_process');
  execSync('ffmpeg -version', { stdio: 'ignore' });
  console.log('✅ FFmpeg available');
} catch {
  if (process.platform === 'linux') {
    console.log('📦 Installing FFmpeg...');
    try {
      const { execSync } = require('child_process');
      execSync('apt-get update -qq && apt-get install -y -qq ffmpeg', { stdio: 'inherit' });
      console.log('✅ FFmpeg installed');
    } catch { console.warn('⚠️ FFmpeg install failed'); }
  }
}

import { initSocket } from './lib/socket';
import { connectRedis } from './lib/redis';
import prisma from './lib/prisma';

import streamsRouter       from './routes/streams';
import tokenRouter         from './routes/token';
import egressRouter        from './routes/egress';
import remindersRouter     from './routes/reminders';
import pollsRouter         from './routes/polls';
import coHostsRouter       from './routes/cohosts';
import authRouter          from './routes/auth';
import adminRouter         from './routes/admin';
import analyticsRouter     from './routes/analytics';
import notificationsRouter from './routes/notifications';
import aiRouter from './routes/ai';
import { startScheduler } from './jobs/scheduler';

const app = express();
const httpServer = createServer(app);

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: true, credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-room-id', 'x-host-token'],
}));
app.options('*', cors());
app.use(express.json());
app.use(morgan('dev'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

app.use('/api', limiter);
app.use('/api/auth', authLimiter);

app.use('/api/auth',          authRouter);
app.use('/api/streams',       streamsRouter);
app.use('/api/token',         tokenRouter);
app.use('/api/egress',        egressRouter);
app.use('/api/reminders',     remindersRouter);
app.use('/api/polls',         pollsRouter);
app.use('/api/cohosts',       coHostsRouter);
app.use('/api/admin',         adminRouter);
app.use('/api/analytics',     analyticsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/ai', aiRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

initSocket(httpServer);

const PORT = parseInt(process.env.PORT || '4000');

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Prisma connected');
    await connectRedis();
    startScheduler();
    httpServer.listen(PORT, () => {
      console.log(`\n🚀 StreamVault Server running on http://localhost:${PORT}`);
      console.log(`📡 Socket.io ready`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
