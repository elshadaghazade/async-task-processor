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
    })
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
        taskQueueName: 'task-processing',
        taskName: 'process-task'
    }
}

export default zod.parse(ConfigSchema, config);