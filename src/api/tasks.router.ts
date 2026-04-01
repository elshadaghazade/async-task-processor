import { Router, type Request, type Response } from 'express';
import { SubmitTaskSchema } from './validators/submit-task.validator';
import { flattenError } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma';
import { logger } from '../lib/logger';
import { enqueueTask } from '../queue/task.queue';
import { TaskStatusEnum } from '../generated/prisma';

export const tasksRouter = Router();

tasksRouter.post('/', async (req: Request, res: Response) => {
  const parsed = SubmitTaskSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation failed',
      details: flattenError(parsed.error),
    });
  }

  const { taskId, payload } = parsed.data;

  let _taskId = taskId;

  if (!_taskId) {
    _taskId = randomUUID();
  }

  const existing = await prisma.task.findUnique({ where: { taskId: _taskId } });

  if (existing) {
    logger.info({ taskId: _taskId }, 'Task already exists - returning current state');

    return res.status(200).json({
      message: 'Task already submitted',
      task: existing,
    });
  }

  const task = await prisma.task.create({
    data: { taskId: _taskId, payload: payload as any, status: TaskStatusEnum.PENDING },
  });

  await enqueueTask({ taskId: _taskId, payload });

  logger.info({ taskId: _taskId }, 'Task submitted and enqueued');

  return res.status(202).json({
    message: 'Task accepted',
    task,
  });
});