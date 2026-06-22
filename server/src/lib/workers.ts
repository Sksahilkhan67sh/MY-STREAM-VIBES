import { Worker, Job } from 'bullmq';
import { getQueueConnection } from './queue-connection';
import { QUEUE_NAMES } from './queues';
import { generateClipsForStream } from '../routes/ai-features';
import { notifyFollowersOfGoLive } from './notification.service';
import { finalizeStreamAnalytics } from '../services/analytics.service';

/**
 * Worker processes for the background job queues defined in queues.ts.
 * Only started when Redis is actually configured (see startWorkers below)
 * — in a no-Redis environment, enqueueOrRunInline already runs every job
 * inline at the call site, so there is nothing for these workers to pick
 * up, and they are simply never started.
 */

const workers: Worker[] = [];

function makeWorker<T>(queueName: string, processor: (job: Job<T>) => Promise<void>): Worker | null {
  const conn = getQueueConnection();
  if (!conn) return null;
  const worker = new Worker<T>(queueName, processor, { connection: conn, concurrency: 5 });
  worker.on('failed', (job, err) => {
    console.error(`[worker:${queueName}] job ${job?.id} failed after ${job?.attemptsMade} attempt(s):`, err?.message);
  });
  return worker;
}

interface AutoClipsJobData { roomId: string; requestedBy: string }
interface NotificationJobData { creatorId: string; streamTitle: string; roomId: string }
interface AnalyticsAggregationJobData { roomId: string }

export function startWorkers() {
  const autoClipsWorker = makeWorker<AutoClipsJobData>(QUEUE_NAMES.AUTO_CLIPS, async (job) => {
    await generateClipsForStream(job.data.roomId, job.data.requestedBy);
  });
  if (autoClipsWorker) workers.push(autoClipsWorker);

  const notificationsWorker = makeWorker<NotificationJobData>(QUEUE_NAMES.NOTIFICATIONS, async (job) => {
    await notifyFollowersOfGoLive(job.data.creatorId, job.data.streamTitle, job.data.roomId);
  });
  if (notificationsWorker) workers.push(notificationsWorker);

  // Uses the existing, complete finalizeStreamAnalytics service (peak
  // concurrent, retention curve, device/country breakdowns, etc.) — this
  // function already existed and was correct, just never triggered
  // automatically; it previously required a manual API call to run at all.
  const analyticsWorker = makeWorker<AnalyticsAggregationJobData>(QUEUE_NAMES.ANALYTICS_AGGREGATION, async (job) => {
    await finalizeStreamAnalytics(job.data.roomId);
  });
  if (analyticsWorker) workers.push(analyticsWorker);

  if (workers.length > 0) {
    console.log(`✅ Started ${workers.length} background job worker(s)`);
  }
}

export async function stopWorkers() {
  await Promise.all(workers.map(w => w.close()));
}
