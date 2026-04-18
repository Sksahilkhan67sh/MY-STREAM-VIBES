import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import { initSocket } from './lib/socket';
import { connectRedis } from './lib/redis';
import streamsRouter from './routes/streams';
import tokenRouter from './routes/token';
import egressRouter from './routes/egress';
import remindersRouter from './routes/reminders';
import { startScheduler } from './jobs/scheduler';

const app = express();
const httpServer = createServer(app);

// ── Middleware ────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(express.json());
app.use(morgan('dev'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// ── Routes ────────────────────────────────────────────────────
app.use('/api/streams', streamsRouter);
app.use('/api/token', tokenRouter);
app.use('/api/egress', egressRouter);
app.use('/api/reminders', remindersRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Socket.io ─────────────────────────────────────────────────
initSocket(httpServer);

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: false,
}));
app.use(cors({
  origin: true,
  credentials: true,
}));

// ── Start ─────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000');

async function main() {
  try {
    await connectRedis();
    startScheduler();
    httpServer.listen(PORT, () => {
      console.log(`\n🚀 StreamVault Server running on http://localhost:${PORT}`);
      console.log(`📡 Socket.io ready`);
      console.log(`🗃️  Database: ${process.env.DATABASE_URL}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
