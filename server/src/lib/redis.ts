import { createClient } from 'redis';

let client: ReturnType<typeof createClient> | null = null;
let available = false;

export async function connectRedis() {
  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries >= 3) {
          // Stop retrying after 3 attempts — Redis is not available
          available = false;
          return false;
        }
        return Math.min(retries * 500, 2000);
      },
      connectTimeout: 3000,
    },
  });

  // Completely silent error handler — no console spam
  client.on('error', () => { available = false; });
  client.on('ready', () => { available = true; });

  try {
    await client.connect();
    available = true;
    console.log('✅ Redis connected');
  } catch {
    available = false;
    console.log('⚠️  Redis unavailable — viewer counts disabled (non-fatal)');
  }
}

export function getRedis() {
  return available ? client : null;
}

export async function setViewerCount(roomId: string, count: number) {
  if (!available || !client) return;
  try { await client.set(`viewers:${roomId}`, count, { EX: 3600 }); } catch { available = false; }
}

export async function getViewerCount(roomId: string): Promise<number> {
  if (!available || !client) return 0;
  try {
    const val = await client.get(`viewers:${roomId}`);
    return val ? parseInt(val) : 0;
  } catch { return 0; }
}

export async function incrementViewerCount(roomId: string): Promise<number> {
  if (!available || !client) return 0;
  try {
    const val = await client.incr(`viewers:${roomId}`);
    await client.expire(`viewers:${roomId}`, 3600);
    return val ?? 0;
  } catch { return 0; }
}

export async function decrementViewerCount(roomId: string): Promise<number> {
  if (!available || !client) return 0;
  try {
    const current = await getViewerCount(roomId);
    if (current <= 0) return 0;
    const val = await client.decr(`viewers:${roomId}`);
    return Math.max(0, val ?? 0);
  } catch { return 0; }
}
