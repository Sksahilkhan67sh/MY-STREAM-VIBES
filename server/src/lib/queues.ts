import { Queue } from 'bullmq';
import { getQueueConnectionOptions, isQueueAvailable } from './queue-connection';

/**
 * Background job queues for expensive/non-critical operations that were
 * previously fire-and-forget calls directly in request handlers (no
 * retries, lost entirely if the process restarted mid-job).
 *
 * Every queue here has a matching `enqueueOrRunInline` call site — if Redis
 * isn't configured, the job's handler function runs immediately in-process
 * instead, preserving the exact behavior that existed before this file was
 * added. Nothing breaks in an environment without Redis; jobs just lose
 * retry/persistence guarantees, exactly like before.
 */

export const QUEUE_NAMES = {
  AUTO_CLIPS: 'auto-clips',
  NOTIFICATIONS: 'notifications',
  ANALYTICS_AGGREGATION: 'analytics-aggregation',
} as const;

const queues = new Map<string, Queue>();

function getQueue(name: string): Queue | null {
  const connection = getQueueConnectionOptions();
  if (!connection) return null;
  if (queues.has(name)) return queues.get(name)!;
  const queue = new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600, count: 200 }, // keep recent history for debugging, don't grow unbounded
      removeOnFail: { age: 86400, count: 500 },
    },
  });
  queues.set(name, queue);
  return queue;
}

/**
 * Enqueue a named job onto a queue, or — if Redis/BullMQ isn't available —
 * run the provided inline fallback immediately instead. This is the single
 * call site every job-producer in the app should use, so the
 * with-Redis/without-Redis behavior difference lives in exactly one place.
 */
export async function enqueueOrRunInline<T>(
  queueName: string,
  jobName: string,
  data: T,
  inlineFallback: (data: T) => Promise<void>
): Promise<void> {
  const queue = getQueue(queueName);
  if (!queue || !isQueueAvailable()) {
    await inlineFallback(data).catch(err =>
      console.error(`[queue:${queueName}] inline fallback for "${jobName}" failed:`, err)
    );
    return;
  }
  try {
    await queue.add(jobName, data);
  } catch (err) {
    console.error(`[queue:${queueName}] enqueue failed for "${jobName}", running inline instead:`, err);
    await inlineFallback(data).catch(e =>
      console.error(`[queue:${queueName}] inline fallback for "${jobName}" also failed:`, e)
    );
  }
}

export function getAllQueues(): Queue[] {
  return [...queues.values()];
}
