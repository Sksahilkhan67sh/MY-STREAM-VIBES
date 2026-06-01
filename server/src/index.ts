import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

dotenv.config();

import { initSocket } from './lib/socket';
import { connectRedis } from './lib/redis';
import prisma from './lib/prisma';
import streamsRouter   from './routes/streams';
import tokenRouter     from './routes/token';
import egressRouter    from './routes/egress';
import remindersRouter, { recoverReminders } from './routes/reminders';
import pollsRouter, { recoverActivePolls } from './routes/polls';
import coHostsRouter   from './routes/cohosts';
import { startScheduler } from './jobs/scheduler';

const app        = express();
const httpServer = createServer(app);

// ── CORS ──────────────────────────────────────────────────────
// Allow the deployed client URL + localhost for dev
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(o => origin === o || origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com'))) {
      return callback(null, true);
    }
    callback(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods:      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-room-id', 'x-host-token'],
}));
app.options('*', cors());

app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Rate limiting ─────────────────────────────────────────────
// General API rate limit — 100 req / 15 min
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      100,
  standardHeaders: true,
  legacyHeaders:   false,
});

// Relaxed limit for token/join routes — 500 req / 15 min
// (busy streams can have 100+ viewers joining in quick succession)
const tokenLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      500,
  standardHeaders: true,
  legacyHeaders:   false,
});
app.set('trust proxy', 1);
app.use('/api', limiter);

// ── Routes ────────────────────────────────────────────────────
app.use('/api/streams',   streamsRouter);
app.use('/api/token',     tokenLimiter, tokenRouter);   // relaxed — viewers joining
app.use('/api/egress',    egressRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/polls',     pollsRouter);
app.use('/api/cohosts',   coHostsRouter);

// ── Health check (keeps Render free tier alive via UptimeRobot) ─
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

// ── Socket.io ─────────────────────────────────────────────────
initSocket(httpServer);

const PORT = parseInt(process.env.PORT || '4000');

async function main() {
  try {
    await prisma.$connect();
    console.log('✅ Prisma connected');

    await connectRedis();
    startScheduler();
  recoverActivePolls().catch(console.error);
  recoverReminders().catch(console.error);

    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 StreamVault Server running on port ${PORT}`);
      console.log(`🌍 Allowed origins: ${allowedOrigins.join(', ')}`);
      console.log(`📡 Socket.io ready`);
      console.log(`🗃️  DB: ${process.env.DATABASE_URL?.split('@')[1] || process.env.DATABASE_URL}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

main();
