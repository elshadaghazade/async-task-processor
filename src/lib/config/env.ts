import zod from 'zod';
import dotenv from 'dotenv';
import path from 'node:path';

if (process.env.NODE_ENV === 'development') {
  dotenv.config({
    path: path.join(__dirname, '../../../.env')
  });
}

const ConfigSchema = zod.object({
    NODE_ENV: zod.string(),
    server: zod.object({
        port: zod.number().positive('Port number must be between 1024-65535')
    }),
    log: zod.object({
        level: zod.string()
    }),
    db: zod.object({
        database_url: zod.string(),
    }),
    queue: zod.object({
        taskQueueName: zod.string(),
        taskName: zod.string()
    }),
    redis: zod.object({
        host: zod.string(),
        port: zod.number().positive(),
        password: zod.string().optional(),
        db: zod.number().optional().default(0),
    }),
});

export type ConfigSchemaType = zod.infer<typeof ConfigSchema>;

const config: ConfigSchemaType = {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    server: {
        port: process.env.SERVER_PORT ? Number(process.env.SERVER_PORT) : 3000
    },
    db: {
        database_url: process.env.DATABASE_URL || '',
    },
    log: {
        level: process.env.LOG_LEVEL ?? 'info'
    },
    queue: {
        taskQueueName: process.env.QUEUE_TASK_QUEUE_NAME || 'task-processing',
        taskName: process.env.QUEUE_TASK_NAME || 'process-task'
    },
    redis: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379,
        password: process.env.REDIS_PASSWORD,
        db: process.env.REDIS_DB ? Number(process.env.REDIS_DB) : 0,
    },
}

export default zod.parse(ConfigSchema, config);