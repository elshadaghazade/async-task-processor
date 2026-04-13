import { z } from 'zod';

export const SubmitTaskSchema = z.object({
    taskId: z.string().regex(/^[a-zA-Z0-9_-]+$/, {
        message: 'taskId must be alphanumeric',
    }).optional(),
    payload: z.record(z.string(), z.unknown())
});

export type TaskEventType = z.infer<typeof SubmitTaskSchema>;