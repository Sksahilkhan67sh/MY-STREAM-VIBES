import IORedis from 'ioredis';

/**
 * BullMQ requires its own `ioredis` connection — it is not compatible with
 * the `node-redis` v4 client already used in redis.ts for viewer counts and
 * caching. Both connections point at the same REDIS_URL and can coexist
 * against the same Redis server without any conflict.
 *
 * Mirrors the existing graceful-fallback philosophy in redis.ts: if
 * REDIS_URL isn't configured, queues are never created and every job-enqueue
 * call below falls back to running inline (the exact fire-and-forget
 * behavior that existed before this file was added) — never a crash, never
 * a behavior change for an environment without Redis configured.
 */

let connection: IORedis | null = null;
let available = false;

export function getQueueConnection(): IORedis | null {
  if (connection) return available ? connection : null;

  const url = process.env.REDIS_URL;
  if (!url || (url.includes('localhost') && process.env.NODE_ENV === 'production')) {
    console.log('⚠️  Redis not configured — background job queue disabled, jobs run inline (non-fatal)');
    return null;
  }

  connection = new IORedis(url, {
    maxRetriesPerRequest: null, // required by BullMQ
    tls: url.startsWith('rediss://') ? {} : undefined,
    lazyConnect: true,
    retryStrategy: (times) => (times > 5 ? null : Math.min(times * 500, 3000)),
  });

  connection.on('error', () => { available = false; });
  connection.on('ready', () => { available = true; console.log('✅ Job queue Redis connection ready'); });

  connection.connect().catch(() => { available = false; });

  // Optimistically usable immediately — BullMQ queues tolerate a connecting
  // client and will simply queue commands until ready. If the connection
  // never succeeds, the 'error' handler above flips `available` to false
  // and subsequent getQueueConnection() calls return null, causing callers
  // to fall back to inline execution.
  available = true;
  return connection;
}

export function isQueueAvailable(): boolean {
  return available && !!connection;
}
