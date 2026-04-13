import { Context } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { dynamo, TABLE } from "../shared/dynamo";
import { SubmitTaskSchema, type TaskEventType } from "./submit-task.validator";
import { z } from 'zod';
import { randomUUID } from 'node:crypto';

export const handler = async (
    event: TaskEventType,
    _context: Context
): Promise<TaskEventType & { status: string }> => {
    console.log("Validating task:", JSON.stringify(event));

    const parsed = SubmitTaskSchema.safeParse(event);

    if (!parsed.success) {
        throw z.flattenError(parsed.error);
    }

    const now = new Date().toISOString();

    const taskId = parsed.data.taskId ?? randomUUID();

    console.log(`Posted task id is: ${taskId}`);

    try {
        await dynamo.send(
            new PutCommand({
                TableName: TABLE,
                Item: {
                    pk: `TASK#${taskId}`,
                    sk: "DETAIL",
                    task_id: taskId,
                    payload: parsed.data.payload,
                    status: "PENDING",
                    created_at: now,
                    updated_at: now,
                },
                ConditionExpression: "attribute_not_exists(pk)",
            })
        );
    } catch (err) {
        if (err instanceof ConditionalCheckFailedException) {
            throw new Error(`Task ${taskId} already exists`);
        }
        throw err;
    }

    console.log(`Task ${taskId} written to DynamoDB with status PENDING`);

    return { ...event, taskId, status: "PENDING" };
};
