import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    findManyMock: vi.fn(),
    countMock: vi.fn(),
    createMock: vi.fn(),
    transactionMock: vi.fn(),
    enqueueTaskMock: vi.fn(),
    loggerInfoMock: vi.fn(),
    loggerWarnMock: vi.fn(),
    loggerErrorMock: vi.fn(),
    randomUUIDMock: vi.fn(() => 'generated-task-id-123'),
}));

vi.mock('../db/prisma', () => ({
    prisma: {
        task: {
            findUnique: mocks.findUniqueMock,
            findMany: mocks.findManyMock,
            count: mocks.countMock,
            create: mocks.createMock,
        },
        $transaction: mocks.transactionMock,
    },
}));

vi.mock('../queue/task.queue', () => ({
    enqueueTask: mocks.enqueueTaskMock,
}));

vi.mock('../lib/logger', () => ({
    logger: {
        info: mocks.loggerInfoMock,
        warn: mocks.loggerWarnMock,
        error: mocks.loggerErrorMock,
    },
}));

vi.mock('node:crypto', async () => {
    const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
    return {
        ...actual,
        randomUUID: mocks.randomUUIDMock,
    };
});

import { postTask, tasksRouter } from './tasks.router';

describe('tasks handlers', () => {
    const buildPostApp = () => {
        const app = express();
        app.use(express.json());
        app.post('/tasks', postTask);

        app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
            res.status(500).json({
                error: err?.message || 'Internal Server Error',
            });
        });

        return app;
    };

    const buildRouterApp = () => {
        const app = express();
        app.use(express.json());
        app.use('/tasks', tasksRouter);

        app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
            res.status(500).json({
                error: err?.message || 'Internal Server Error',
            });
        });

        return app;
    };

    beforeEach(() => {
        vi.clearAllMocks();

        mocks.transactionMock.mockImplementation(async (callback: any) => {
            return callback({
                task: {
                    create: mocks.createMock,
                },
            });
        });
    });

    describe('POST /tasks', () => {
        it('returns 400 when body is invalid', async () => {
            const app = buildPostApp();

            const response = await request(app)
                .post('/tasks')
                .send({
                    payload: 'not-an-object',
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Validation failed');

            expect(mocks.findUniqueMock).not.toHaveBeenCalled();
            expect(mocks.createMock).not.toHaveBeenCalled();
            expect(mocks.enqueueTaskMock).not.toHaveBeenCalled();
        });

        it('returns 400 when taskId format is invalid', async () => {
            const app = buildPostApp();

            const response = await request(app)
                .post('/tasks')
                .send({
                    taskId: 'bad id with spaces',
                    payload: { foo: 'bar' },
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Validation failed');

            expect(mocks.findUniqueMock).not.toHaveBeenCalled();
            expect(mocks.createMock).not.toHaveBeenCalled();
            expect(mocks.enqueueTaskMock).not.toHaveBeenCalled();
        });

        it('returns 200 when task already exists', async () => {
            const app = buildPostApp();

            const existingTask = {
                id: 1,
                taskId: 'existing-task',
                payload: { foo: 'bar' },
                status: 'PENDING',
                retryCount: 0,
                errorMessage: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            mocks.findUniqueMock.mockResolvedValue(existingTask);

            const response = await request(app)
                .post('/tasks')
                .send({
                    taskId: 'existing-task',
                    payload: { foo: 'bar' },
                });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                message: 'Task already submitted',
                task: existingTask,
            });

            expect(mocks.findUniqueMock).toHaveBeenCalledWith({
                where: { taskId: 'existing-task' },
            });

            expect(mocks.createMock).not.toHaveBeenCalled();
            expect(mocks.enqueueTaskMock).not.toHaveBeenCalled();
        });

        it('creates and enqueues a task when taskId is provided and does not exist', async () => {
            const app = buildPostApp();

            const createdTask = {
                id: 2,
                taskId: 'custom-task-1',
                payload: { hello: 'world' },
                status: 'PENDING',
                retryCount: 0,
                errorMessage: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            mocks.findUniqueMock.mockResolvedValue(null);
            mocks.createMock.mockResolvedValue(createdTask);
            mocks.enqueueTaskMock.mockResolvedValue(undefined);

            const payload = { hello: 'world' };

            const response = await request(app)
                .post('/tasks')
                .send({
                    taskId: 'custom-task-1',
                    payload,
                });

            expect(response.status).toBe(202);
            expect(response.body).toEqual({
                message: 'Task accepted',
                task: createdTask,
            });

            expect(mocks.findUniqueMock).toHaveBeenCalledWith({
                where: { taskId: 'custom-task-1' },
            });

            expect(mocks.createMock).toHaveBeenCalledWith({
                data: {
                    taskId: 'custom-task-1',
                    payload,
                    status: 'PENDING',
                },
            });

            expect(mocks.enqueueTaskMock).toHaveBeenCalledWith({
                taskId: 'custom-task-1',
                payload,
            });
        });

        it('generates taskId when it is not provided', async () => {
            const app = buildPostApp();

            const payload = { a: 1, b: true };

            const createdTask = {
                id: 3,
                taskId: 'generated-task-id-123',
                payload,
                status: 'PENDING',
                retryCount: 0,
                errorMessage: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            mocks.findUniqueMock.mockResolvedValue(null);
            mocks.createMock.mockResolvedValue(createdTask);
            mocks.enqueueTaskMock.mockResolvedValue(undefined);

            const response = await request(app)
                .post('/tasks')
                .send({ payload });

            expect(response.status).toBe(202);
            expect(response.body).toEqual({
                message: 'Task accepted',
                task: createdTask,
            });

            expect(mocks.findUniqueMock).toHaveBeenCalledWith({
                where: { taskId: 'generated-task-id-123' },
            });

            expect(mocks.createMock).toHaveBeenCalledWith({
                data: {
                    taskId: 'generated-task-id-123',
                    payload,
                    status: 'PENDING',
                },
            });

            expect(mocks.enqueueTaskMock).toHaveBeenCalledWith({
                taskId: 'generated-task-id-123',
                payload,
            });
        });

        it('returns 500 when task creation fails inside transaction', async () => {
            const app = buildPostApp();

            mocks.findUniqueMock.mockResolvedValue(null);
            mocks.createMock.mockRejectedValue(new Error('db create failed'));

            const response = await request(app)
                .post('/tasks')
                .send({
                    taskId: 'task-db-fail',
                    payload: { x: 1 },
                });

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                error: 'Task was not processed',
            });
        });

        it('returns 500 when enqueue fails', async () => {
            const app = buildPostApp();

            const createdTask = {
                id: 4,
                taskId: 'task-enqueue-fail',
                payload: { x: 1 },
                status: 'PENDING',
                retryCount: 0,
                errorMessage: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            mocks.findUniqueMock.mockResolvedValue(null);
            mocks.createMock.mockResolvedValue(createdTask);
            mocks.enqueueTaskMock.mockRejectedValue(new Error('queue unavailable'));

            const response = await request(app)
                .post('/tasks')
                .send({
                    taskId: 'task-enqueue-fail',
                    payload: { x: 1 },
                });

            expect(response.status).toBe(500);
            expect(response.body).toEqual({
                error: 'Task was not processed',
            });
        });
    });

    describe('GET /tasks', () => {
        it('returns paginated tasks without status filter', async () => {
            const app = buildRouterApp();

            const tasks = [
                {
                    id: 1,
                    taskId: 'task-1',
                    payload: { foo: 'bar' },
                    status: 'PENDING',
                    retryCount: 0,
                    errorMessage: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                {
                    id: 2,
                    taskId: 'task-2',
                    payload: { foo: 'baz' },
                    status: 'COMPLETED',
                    retryCount: 0,
                    errorMessage: null,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            mocks.findManyMock.mockResolvedValue(tasks);
            mocks.countMock.mockResolvedValue(2);

            const response = await request(app).get('/tasks');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                total: 2,
                tasks,
            });

            expect(mocks.findManyMock).toHaveBeenCalledWith({
                where: { status: undefined },
                orderBy: { createdAt: 'desc' },
                take: 20,
                skip: 0,
            });

            expect(mocks.countMock).toHaveBeenCalledWith({
                where: { status: undefined },
            });
        });

        it('returns filtered tasks with status, limit and offset', async () => {
            const app = buildRouterApp();

            const tasks = [
                {
                    id: 3,
                    taskId: 'task-3',
                    payload: { a: 1 },
                    status: 'FAILED',
                    retryCount: 2,
                    errorMessage: 'boom',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            mocks.findManyMock.mockResolvedValue(tasks);
            mocks.countMock.mockResolvedValue(1);

            const response = await request(app)
                .get('/tasks')
                .query({
                    status: 'FAILED',
                    limit: '10',
                    offset: '5',
                });

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                total: 1,
                tasks,
            });

            expect(mocks.findManyMock).toHaveBeenCalledWith({
                where: { status: 'FAILED' },
                orderBy: { createdAt: 'desc' },
                take: 10,
                skip: 5,
            });

            expect(mocks.countMock).toHaveBeenCalledWith({
                where: { status: 'FAILED' },
            });
        });

        it('caps limit at 100', async () => {
            const app = buildRouterApp();

            mocks.findManyMock.mockResolvedValue([]);
            mocks.countMock.mockResolvedValue(0);

            const response = await request(app)
                .get('/tasks')
                .query({
                    limit: '999',
                    offset: '0',
                });

            expect(response.status).toBe(200);

            expect(mocks.findManyMock).toHaveBeenCalledWith({
                where: { status: undefined },
                orderBy: { createdAt: 'desc' },
                take: 100,
                skip: 0,
            });
        });

        it('returns 400 for invalid query params', async () => {
            const app = buildRouterApp();

            const response = await request(app)
                .get('/tasks')
                .query({
                    status: 'WRONG_STATUS',
                    limit: '-1',
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Validation failed');

            expect(mocks.findManyMock).not.toHaveBeenCalled();
            expect(mocks.countMock).not.toHaveBeenCalled();
        });
    });

    describe('GET /tasks/failed', () => {
        it('returns failed tasks ordered by updatedAt desc', async () => {
            const app = buildRouterApp();

            const failedTasks = [
                {
                    id: 10,
                    taskId: 'failed-1',
                    payload: { a: 1 },
                    status: 'FAILED',
                    retryCount: 2,
                    errorMessage: 'Fail reason 1',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
                {
                    id: 11,
                    taskId: 'failed-2',
                    payload: { b: 2 },
                    status: 'FAILED',
                    retryCount: 1,
                    errorMessage: 'Fail reason 2',
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            mocks.findManyMock.mockResolvedValue(failedTasks);

            const response = await request(app).get('/tasks/failed');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                total: 2,
                tasks: failedTasks,
            });

            expect(mocks.findManyMock).toHaveBeenCalledWith({
                where: { status: 'FAILED' },
                orderBy: { updatedAt: 'desc' },
            });
        });

        it('returns empty list when there are no failed tasks', async () => {
            const app = buildRouterApp();

            mocks.findManyMock.mockResolvedValue([]);

            const response = await request(app).get('/tasks/failed');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({
                total: 0,
                tasks: [],
            });
        });
    });

    describe('GET /tasks/:taskId', () => {
        it('returns a task by taskId', async () => {
            const app = buildRouterApp();

            const task = {
                id: 20,
                taskId: 'task-lookup-1',
                payload: { hello: 'world' },
                status: 'PROCESSING',
                retryCount: 0,
                errorMessage: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };

            mocks.findUniqueMock.mockResolvedValue(task);

            const response = await request(app).get('/tasks/task-lookup-1');

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ task });

            expect(mocks.findUniqueMock).toHaveBeenCalledWith({
                where: { taskId: 'task-lookup-1' },
            });
        });

        it('returns 404 when task does not exist', async () => {
            const app = buildRouterApp();

            mocks.findUniqueMock.mockResolvedValue(null);

            const response = await request(app).get('/tasks/missing-task');

            expect(response.status).toBe(404);
            expect(response.body).toEqual({
                error: "Task 'missing-task' not found",
            });
        });
    });
});