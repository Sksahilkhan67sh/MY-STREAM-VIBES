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
import streamsRouter       from './routes/streams';
import tokenRouter         from './routes/token';
import egressRouter        from './routes/egress';
import remindersRouter, { recoverReminders } from './routes/reminders';
import pollsRouter, { recoverActivePolls }   from './routes/polls';
import coHostsRouter       from './routes/cohosts';
import analyticsRouter     from './routes/analytics';
import donationsRouter     from './routes/donations';
import subscriptionsRouter from './routes/subscriptions';
import ppvRouter           from './routes/ppv';
import captionsRouter      from './routes/captions';   // ← was missing
import summaryRouter       from './routes/summary';    // ← was missing
import multistreamRouter   from './routes/multistream'; // ← was missing

const app        = express();
const httpServer = createServer(app);

const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      allowedOrigins.some(o => origin === o) ||
      origin.endsWith('.vercel.app') ||
      origin.endsWith('.onrender.com')
    ) return callback(null, true);
    callback(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods:      ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-room-id', 'x-host-token', 'x-user-id'],
}));
app.options('*', cors());
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const limiter = rateLimit({ windowMs: 15*60*1000, max: 200, standardHeaders: true, legacyHeaders: false });
const tokenLimiter = rateLimit({ windowMs: 15*60*1000, max: 500, standardHeaders: true, legacyHeaders: false });

app.set('trust proxy', 1);
app.use('/api', limiter);

// ── Routes ────────────────────────────────────────────────────
app.use('/api/streams',       streamsRouter);
app.use('/api/token',         tokenLimiter, tokenRouter);
app.use('/api/egress',        egressRouter);
app.use('/api/reminders',     remindersRouter);
app.use('/api/polls',         pollsRouter);
app.use('/api/cohosts',       coHostsRouter);
app.use('/api/analytics',     analyticsRouter);
app.use('/api/donations',     donationsRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/ppv',           ppvRouter);
app.use('/api/captions',      captionsRouter);    // ← now mounted
app.use('/api/summary',       summaryRouter);     // ← now mounted
app.use('/api/multistream',   multistreamRouter); // ← now mounted

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), env: process.env.NODE_ENV });
});

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
      console.log(`\n🚀 Server on port ${PORT}`);
      console.log(`🌍 Origins: ${allowedOrigins.join(', ')}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

import { startScheduler } from './jobs/scheduler';
main();
