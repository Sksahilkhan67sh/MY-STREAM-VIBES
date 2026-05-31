import { createClient } from 'redis';

let client: ReturnType<typeof createClient> | null = null;
let available = false;

// In-memory fallback for viewer counts when Redis is not configured
const memCounts = new Map<string, number>();

export async function connectRedis() {
  const url = process.env.REDIS_URL;

  // If no REDIS_URL is set at all, skip silently
  if (!url || url.includes('localhost') && process.env.NODE_ENV === 'production') {
    console.log('⚠️  Redis not configured — viewer counts disabled (non-fatal)');
    return;
  }

  client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries >= 5) {
          available = false;
          return false;
        }
        return Math.min(retries * 500, 3000);
      },
      connectTimeout: 5000,
      tls: url.startsWith('rediss://'), // support Upstash TLS URLs
    },
  });

  client.on('error', () => { available = false; });
  client.on('ready', () => { available = true; console.log('✅ Redis connected'); });

  try {
    await client.connect();
    available = true;
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
  if (!available || !client) {
    const count = (memCounts.get(roomId) ?? 0) + 1;
    memCounts.set(roomId, count);
    return count;
  }
  try {
    const val = await client.incr(`viewers:${roomId}`);
    await client.expire(`viewers:${roomId}`, 3600);
    return val ?? 0;
  } catch { return 0; }
}

export async function decrementViewerCount(roomId: string): Promise<number> {
  if (!available || !client) {
    const count = Math.max(0, (memCounts.get(roomId) ?? 0) - 1);
    memCounts.set(roomId, count);
    return count;
  }
  try {
    const current = await getViewerCount(roomId);
    if (current <= 0) return 0;
    const val = await client.decr(`viewers:${roomId}`);
    return Math.max(0, val ?? 0);
  } catch { return 0; }
}
