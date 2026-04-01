import { Queue } from 'bullmq';
import { redisConnection } from '../lib/redis';
import { logger } from '../lib/logger';
import config from '../lib/config/env';

export const TASK_QUEUE_NAME = config.queue.taskQueueName;

export const MAX_RETRIES = 2;
export const BACKOFF_BASE_MS = 5000;

export const taskQueue = new Queue(TASK_QUEUE_NAME, {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: MAX_RETRIES + 1,
    backoff: {
      type: 'exponential',
      delay: BACKOFF_BASE_MS,
    },
    removeOnComplete: true,
    removeOnFail: true,
  },
});

taskQueue.on('error', (err) => {
  logger.error({ err }, 'Task queue error');
});

export interface TaskJobData {
  taskId: string;
  payload: Record<string, unknown>;
}

export const enqueueTask = async (data: TaskJobData) => {
  const job = await taskQueue.add(config.queue.taskName, data, {
    jobId: data.taskId
  });

  logger.info({ taskId: data.taskId, jobId: job.id }, 'Task enqueued');
}
