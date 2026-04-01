import type { Job } from 'bullmq';
import type { TaskJobData } from '../queue/task.queue';
import { prisma } from '../db/prisma';
import { logger } from '../lib/logger';

const FAILURE_RATE = 0.3;

const reasons = [
  'Fail reason 1',
  'Fail reason 2',
  'Fail reason 3',
  'Fail reason 4',
] as const;

const simulateRandomFailure = async () => {
  if (Math.random() < FAILURE_RATE) {

    const reason = reasons[Math.floor(Math.random() * reasons.length)];
    throw new Error(reason);
  }
}

const simulateWork = async (payload: Record<string, unknown>) => {

  const duration = 500 + Math.floor(Math.random() * 1000);
  await new Promise((resolve) => setTimeout(resolve, duration));

  return {
    processed: true,
    processedAt: new Date().toISOString(),
    inputKeys: Object.keys(payload),
    durationMs: duration,
  };
}

export const processTaskJob = async (job: Job<TaskJobData>) => {
  const { taskId, payload } = job.data;

  const attemptNumber = job.attemptsMade + 1;
  const maxAttempts = job.opts.attempts ?? 3;
  const isRetry = attemptNumber > 1;

  logger.info(
    { taskId, jobId: job.id, attempt: attemptNumber, maxAttempts },
    isRetry ? 'Retrying task' : 'Processing task'
  );

  if (!isRetry) {

    await prisma.task.update({
      where: { taskId },
      data: { status: 'PROCESSING', retryCount: 0 },
    });

  } else {

    await prisma.task.update({
      where: { taskId },
      data: { retryCount: job.attemptsMade },
    });

  }

  try {
    await simulateRandomFailure();
    const result = await simulateWork(payload);

    await prisma.task.update({
      where: { taskId },
      data: {
        status: 'COMPLETED',
        errorMessage: null,
      },
    });

    logger.info({ taskId, result }, 'Task completed successfully');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const isLastAttempt = attemptNumber >= maxAttempts;

    logger.warn(
      { taskId, attempt: attemptNumber, maxAttempts, error: errorMessage, isLastAttempt },
      'Task attempt failed'
    );

    if (isLastAttempt) {
      await prisma.task.update({
        where: { taskId },
        data: {
          status: 'FAILED',
          errorMessage,
          retryCount: job.attemptsMade,
        },
      });
      logger.error({ taskId, errorMessage, retryCount: job.attemptsMade }, 'Task permanently failed');
    }

    throw err;
  }
}
