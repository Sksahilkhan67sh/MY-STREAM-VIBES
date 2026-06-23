/**
 * BullMQ's `connection` option accepts either a live ioredis instance OR a
 * plain connection-options object — and only the options-object form is
 * safe to use here. If we constructed our own `ioredis` instance from the
 * top-level `ioredis` package and handed it to BullMQ, npm can (and on
 * Render, did) install a *second*, separately-nested copy of `ioredis`
 * inside bullmq's own node_modules whenever version ranges don't resolve
 * identically. TypeScript then treats our instance and BullMQ's expected
 * type as two different classes — same code, same version, different
 * module identity — and the build fails with a duplicate-dependency type
 * mismatch (`Type 'Redis' is not assignable to type 'ConnectionOptions'`).
 *
 * Passing a plain options object instead sidesteps the whole problem:
 * plain objects have no class identity to clash on, and BullMQ constructs
 * its own internal ioredis connection (using its own nested copy) from
 * these options. This is also BullMQ's own documented/recommended pattern,
 * not a workaround unique to this codebase.
 *
 * Mirrors the existing graceful-fallback philosophy in redis.ts: if
 * REDIS_URL isn't configured, this returns null and every job-enqueue call
 * elsewhere falls back to running inline (the exact fire-and-forget
 * behavior that existed before background jobs were added) — never a
 * crash, never a behavior change for an environment without Redis configured.
 */

import type { ConnectionOptions } from 'bullmq';

let cachedOptions: ConnectionOptions | null | undefined; // undefined = not yet resolved, null = resolved-but-unavailable

export function getQueueConnectionOptions(): ConnectionOptions | null {
  if (cachedOptions !== undefined) return cachedOptions;

  const url = process.env.REDIS_URL;
  if (!url || (url.includes('localhost') && process.env.NODE_ENV === 'production')) {
    console.log('⚠️  Redis not configured — background job queue disabled, jobs run inline (non-fatal)');
    cachedOptions = null;
    return null;
  }

  // BullMQ's RedisOptions type directly supports a `url` field — passing it
  // straight through is simpler and less error-prone than manually parsing
  // host/port/username/password out of the connection string ourselves.
  cachedOptions = {
    url,
    tls: url.startsWith('rediss://') ? {} : undefined,
    maxRetriesPerRequest: null, // required by BullMQ
  };
  console.log('✅ Job queue Redis connection options resolved');
  return cachedOptions;
}

export function isQueueAvailable(): boolean {
  return getQueueConnectionOptions() !== null;
}
