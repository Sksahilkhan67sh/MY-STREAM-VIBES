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
import streamsRouter from './routes/streams';
import tokenRouter from './routes/token';
import egressRouter from './routes/egress';
import remindersRouter from './routes/reminders';
import pollsRouter from './routes/polls';
import { startScheduler } from './jobs/scheduler';
import { checkFFmpeg } from './lib/ffmpeg';


const app = express();
const httpServer = createServer(app);

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-room-id', 'x-host-token'],
}));
app.options('*', cors());
app.use(express.json());
app.use(morgan('dev'));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use('/api', limiter);

app.use('/api/streams', streamsRouter);
app.use('/api/token', tokenRouter);
app.use('/api/egress', egressRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/polls', pollsRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

initSocket(httpServer);

const PORT = parseInt(process.env.PORT || '4000');

async function main() {
  try {
    // Test prisma connection and log available models
    await prisma.$connect();
    const modelNames = Object.keys(prisma).filter(k => !k.startsWith('$') && !k.startsWith('_'));
    console.log('✅ Prisma connected. Models:', modelNames.join(', '));

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
