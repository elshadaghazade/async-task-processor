import { Context } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "../shared/dynamo";
import {
    SubmitTaskSchema,
    type TaskEventType,
} from "../validate_task/submit-task.validator";
import { z } from "zod";

const FAILURE_RATE = 0.3;

const reasons = [
    "Fail reason 1",
    "Fail reason 2",
    "Fail reason 3",
    "Fail reason 4",
] as const;

const simulateRandomFailure = async () => {
    if (Math.random() < FAILURE_RATE) {
        const reason = reasons[Math.floor(Math.random() * reasons.length)];
        throw new Error(reason);
    }
};

const simulateWork = async (payload: Record<string, unknown>) => {
    const duration = 500 + Math.floor(Math.random() * 1000);
    await new Promise((resolve) => setTimeout(resolve, duration));

    return {
        processed: true,
        processed_at: new Date().toISOString(),
        inputKeys: Object.keys(payload),
        durationMs: duration,
    };
};

const updateStatus = async (
    taskId: string,
    status: string,
    extra: Record<string, unknown> = {}
): Promise<void> => {
    const now = new Date().toISOString();

    const extraKeys = Object.keys(extra);
    const extraExpr = extraKeys.map((k) => `#${k} = :${k}`).join(", ");
    const updateExpression = `SET #s = :s, #updated_at = :now${extraKeys.length ? `, ${extraExpr}` : ""
        }`;

    const expressionAttributeNames: Record<string, string> = {
        "#s": "status",
        "#updated_at": "updated_at",
        ...Object.fromEntries(extraKeys.map((k) => [`#${k}`, k])),
    };

    const expressionAttributeValues: Record<string, unknown> = {
        ":s": status,
        ":now": now,
        ...Object.fromEntries(extraKeys.map((k) => [`:${k}`, extra[k]])),
    };

    await dynamo.send(
        new UpdateCommand({
            TableName: TABLE,
            Key: { pk: `TASK#${taskId}`, sk: "DETAIL" },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
        })
    );
};

const incrementRetries = async (
    taskId: string,
    errorMessage?: string
): Promise<void> => {
    const now = new Date().toISOString();

    await dynamo.send(
        new UpdateCommand({
            TableName: TABLE,
            Key: { pk: `TASK#${taskId}`, sk: "DETAIL" },
            UpdateExpression: `
        SET #updated_at = :now,
            #last_error = :err,
            #retries = if_not_exists(#retries, :zero) + :one
      `,
            ExpressionAttributeNames: {
                "#updated_at": "updated_at",
                "#last_error": "last_error",
                "#retries": "retries",
            },
            ExpressionAttributeValues: {
                ":now": now,
                ":err": errorMessage ?? "Unknown error",
                ":zero": 0,
                ":one": 1,
            },
        })
    );
};

export const handler = async (
    event: TaskEventType,
    _context: Context
): Promise<ReturnType<typeof simulateWork>> => {
    const parsed = SubmitTaskSchema.safeParse(event);

    if (!parsed.success) {
        throw new Error(z.prettifyError(parsed.error));
    }

    const { taskId, payload } = parsed.data;

    console.log(
        `Processing task: ${taskId}, payload: ${JSON.stringify(payload, null, 2)}`
    );

    try {
        await updateStatus(taskId!, "PROCESSING");

        await simulateRandomFailure();
        const result = await simulateWork(payload);

        await updateStatus(taskId!, "COMPLETED", result);

        return {...parsed.data, ...result};
    } catch (err) {
        const errorMessage =
            err instanceof Error ? err.message : "Unknown processing error";

        await incrementRetries(taskId!, errorMessage);
        throw err;
    }
};