import 'dotenv/config';
import { Worker } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { logger } from '../lib/logger';
import config from '../lib/config/env';

const TASK_QUEUE_NAME = config.queue.taskQueueName;

const worker = new Worker(TASK_QUEUE_NAME, async () => {
  return;
}, {
  connection: redisConnection,
  concurrency: 5,
});

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, taskId: job.data.taskId }, 'Job completed');
});

worker.on('failed', (job, err) => {
  if (!job) return;
  const attemptsMade = job.attemptsMade;
  const maxAttempts = job.opts.attempts ?? 3;
  const willRetry = attemptsMade < maxAttempts;

  logger.warn(
    {
      jobId: job.id,
      taskId: job.data.taskId,
      attempt: attemptsMade,
      maxAttempts,
      willRetry,
      error: err.message,
    },
    willRetry ? 'Job failed — will retry' : 'Job failed — no more retries'
  );
});

worker.on('error', (err) => {
  logger.error({ err }, 'Worker error');
});

logger.info({ queue: TASK_QUEUE_NAME, concurrency: 5 }, 'Worker started');

const shutdown = async () => {
  logger.info('Shutting down worker...');
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
