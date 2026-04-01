import zod, { z } from 'zod';
import { TaskStatusEnum } from '../../generated/prisma';

export const GetTasksQuerySchema = z.object({
    status: z.enum(TaskStatusEnum).optional(),
    limit: z.string().regex(/^\d+$/, 'limit must be a non negative integer').default("20").transform(Number),
    offset: z.string().regex(/^\d+$/, 'offset must be a non negative integer').default('0').transform(Number)
});