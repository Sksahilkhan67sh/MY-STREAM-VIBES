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

// Alias used by analytics service
export function getRedisClient() {
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

// ── Generic cache helpers ───────────────────────────────────────────────────
// Used by search/feed/creator-profile caching. Same in-memory fallback
// pattern as viewer counts: if Redis isn't available, callers simply miss
// the cache every time and fall through to a live DB query — never an
// error, never a behavior change, just slower without Redis configured.
const memCache = new Map<string, { value: string; expiresAt: number }>();

export async function getCache<T>(key: string): Promise<T | null> {
  if (!available || !client) {
    const entry = memCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) { memCache.delete(key); return null; }
    try { return JSON.parse(entry.value) as T; } catch { return null; }
  }
  try {
    const val = await client.get(key);
    return val ? (JSON.parse(val) as T) : null;
  } catch { return null; }
}

export async function setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const serialized = JSON.stringify(value);
  if (!available || !client) {
    memCache.set(key, { value: serialized, expiresAt: Date.now() + ttlSeconds * 1000 });
    // Bound the in-memory fallback so a long-running no-Redis instance can't leak memory.
    if (memCache.size > 2000) {
      const oldestKey = memCache.keys().next().value;
      if (oldestKey) memCache.delete(oldestKey);
    }
    return;
  }
  try { await client.set(key, serialized, { EX: ttlSeconds }); } catch { /* non-fatal */ }
}

export async function deleteCache(keyOrPrefix: string, isPrefix = false): Promise<void> {
  if (!available || !client) {
    if (!isPrefix) { memCache.delete(keyOrPrefix); return; }
    for (const k of memCache.keys()) if (k.startsWith(keyOrPrefix)) memCache.delete(k);
    return;
  }
  try {
    if (!isPrefix) { await client.del(keyOrPrefix); return; }
    // SCAN rather than KEYS — safe to run against production Redis without blocking it.
    let cursor = 0;
    do {
      const reply = await client.scan(cursor, { MATCH: `${keyOrPrefix}*`, COUNT: 100 });
      cursor = reply.cursor;
      if (reply.keys.length) await client.del(reply.keys);
    } while (cursor !== 0);
  } catch { /* non-fatal */ }
}
