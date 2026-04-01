import { type RequestHandler, Router } from 'express';
import { SubmitTaskSchema } from './validators/submit-task.validator';
import { flattenError } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '../db/prisma';
import { logger } from '../lib/logger';
import { enqueueTask } from '../queue/task.queue';
import { type Prisma, TaskStatusEnum } from '../generated/prisma';
import { GetTasksQuerySchema } from './validators/get-tasks-query.validator';

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

export const postTask: RequestHandler = async (req, res) => {
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

    try {
        return await prisma.$transaction(async prisma => {
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
    } catch (err) {
        return res.status(500).json({
            error: 'Task was not processed',
        });
    }
}

/**
 * @openapi
 * /api/v1/tasks:
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Get tasks
 *     description: Returns a paginated list of tasks. Can be filtered by status.
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         description: Filter tasks by status
 *         schema:
 *           type: string
 *           enum:
 *             - PENDING
 *             - PROCESSING
 *             - COMPLETED
 *             - FAILED
 *       - in: query
 *         name: limit
 *         required: false
 *         description: Maximum number of tasks to return
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 0
 *           example: 20
 *       - in: query
 *         name: offset
 *         required: false
 *         description: Number of tasks to skip
 *         schema:
 *           type: integer
 *           default: 0
 *           minimum: 0
 *           example: 0
 *     responses:
 *       200:
 *         description: List of tasks
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                   example: 125
 *                 tasks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       taskId:
 *                         type: string
 *                         example: task_123
 *                       payload:
 *                         type: object
 *                         additionalProperties: true
 *                       status:
 *                         type: string
 *                         example: PENDING
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Validation failed
 */

const getTasks: RequestHandler = async (req, res) => {
    const parsed = GetTasksQuerySchema.safeParse(req.query);

    if (!parsed.success) {
        return res.status(400).json({
            error: 'Validation failed',
            details: flattenError(parsed.error),
        });
    }

    const { status, limit, offset } = parsed.data;

    const where: Prisma.TaskWhereInput = {
        status,
    };

    const [tasks, total] = await Promise.all([
        prisma.task.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: Math.min(limit, 100),
            skip: offset,
        }),
        prisma.task.count({ where }),
    ]);

    return res.json({ total, tasks });
}


tasksRouter.post('/', postTask);
tasksRouter.get('/', getTasks);