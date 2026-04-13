import { Context } from "aws-lambda";
import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "../shared/dynamo";
import { type TaskEventType } from "./submit-task.validator";

type FailTaskEvent = TaskEventType & {
    error?: unknown;
};

const extractErrorReason = (error: unknown): string => {
    if (!error) return "Unknown error";

    if (typeof error === "string") return error;

    if (error instanceof Error) return error.message;

    if (typeof error === "object") {
        const obj = error as Record<string, unknown>;

        if (typeof obj.Cause === "string") return obj.Cause;
        if (typeof obj.cause === "string") return obj.cause;
        if (typeof obj.Error === "string") return obj.Error;
        if (typeof obj.error === "string") return obj.error;
        if (typeof obj.message === "string") return obj.message;

        return JSON.stringify(obj);
    }

    return String(error);
};

export const handler = async (
    event: FailTaskEvent,
    _context: Context
): Promise<FailTaskEvent & { status: "FAILED"; failed_at: string; error_reason: string }> => {
    console.log("Failing task:", JSON.stringify(event, null, 2));

    const now = new Date().toISOString();
    const errorReason = extractErrorReason(event.error);

    await dynamo.send(
        new UpdateCommand({
            TableName: TABLE,
            Key: {
                pk: `TASK#${event.taskId}`,
                sk: "DETAIL",
            },
            UpdateExpression: `
        SET #status = :status,
            #updated_at = :updated_at,
            #failed_at = :failed_at,
            #error_reason = :error_reason
      `,
            ExpressionAttributeNames: {
                "#status": "status",
                "#updated_at": "updated_at",
                "#failed_at": "failed_at",
                "#error_reason": "error",
            },
            ExpressionAttributeValues: {
                ":status": "FAILED",
                ":updated_at": now,
                ":failed_at": now,
                ":error_reason": errorReason,
            },
            ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)",
        })
    );

    return {
        ...event,
        status: "FAILED",
        failed_at: now,
        error_reason: errorReason,
    };
};