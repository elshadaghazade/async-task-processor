import { Router, type Request, type Response } from 'express';
import { SubmitTaskSchema } from './validators/submit-task.validator';
import { flattenError } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma';
import { logger } from '../lib/logger';
import { enqueueTask } from '../queue/task.queue';
import { TaskStatusEnum } from '../generated/prisma';

export const tasksRouter = Router();

/**
 * @openapi
 * /api/v1/tasks:
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Submit a new task
 *     description: Creates a new task if taskId does not already exist, enqueues it for processing, and returns the accepted task. If the task already exists, returns the current state instead.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             optional:
 *               - taskId
 *             required:
 *               - payload
 *             properties:
 *               taskId:
 *                 type: string
 *                 pattern: ^[a-zA-Z0-9_-]+$
 *                 example: task_123
 *               payload:
 *                 type: object
 *                 additionalProperties: true
 *                 example:
 *                   userId: 42
 *                   action: send_email
 *     responses:
 *       202:
 *         description: Task accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Task accepted
 *                 task:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     taskId:
 *                       type: string
 *                       example: task_123
 *                     payload:
 *                       type: object
 *                       additionalProperties: true
 *                     status:
 *                       type: string
 *                       example: PENDING
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       200:
 *         description: Task already submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Task already submitted
 *                 task:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     taskId:
 *                       type: string
 *                       example: task_123
 *                     payload:
 *                       type: object
 *                       additionalProperties: true
 *                     status:
 *                       type: string
 *                       example: PENDING
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation failed
 */

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