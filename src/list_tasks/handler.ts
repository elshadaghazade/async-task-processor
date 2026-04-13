import {
    APIGatewayProxyEventV2,
    APIGatewayProxyResultV2,
    Context,
} from "aws-lambda";
import { QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "../shared/dynamo";
import { respond } from "../shared/respond";

const ALLOWED_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
type TaskStatus = (typeof ALLOWED_STATUSES)[number];

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const parseLimit = (raw?: string): number => {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
    return Math.min(Math.floor(n), MAX_LIMIT);
};

const decodeNextToken = (token?: string): Record<string, unknown> | undefined => {
    if (!token) return undefined;

    try {
        return JSON.parse(Buffer.from(token, "base64").toString("utf8"));
    } catch {
        throw new Error("Invalid nextToken");
    }
};

const encodeNextToken = (key?: Record<string, unknown>): string | null => {
    if (!key) return null;
    return Buffer.from(JSON.stringify(key), "utf8").toString("base64");
};

export const handler = async (
    event: APIGatewayProxyEventV2,
    _context: Context
): Promise<APIGatewayProxyResultV2> => {
    try {
        const query = event.queryStringParameters ?? {};
        const status = query.status as TaskStatus | undefined;
        const limit = parseLimit(query.limit);
        const nextToken = decodeNextToken(query.nextToken);

        if (status && !ALLOWED_STATUSES.includes(status)) {
            return respond(400, {
                error: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(", ")}`,
            });
        }

        const result = status
            ? await dynamo.send(
                new QueryCommand({
                    TableName: TABLE,
                    IndexName: "status-created-index",
                    KeyConditionExpression: "#status = :status",
                    ExpressionAttributeNames: {
                        "#status": "status",
                    },
                    ExpressionAttributeValues: {
                        ":status": status,
                    },
                    ExclusiveStartKey: nextToken,
                    Limit: limit,
                    ScanIndexForward: false,
                })
            )
            : await dynamo.send(
                new ScanCommand({
                    TableName: TABLE,
                    FilterExpression: "#sk = :detail",
                    ExpressionAttributeNames: {
                        "#sk": "sk",
                    },
                    ExpressionAttributeValues: {
                        ":detail": "DETAIL",
                    },
                    ExclusiveStartKey: nextToken,
                    Limit: limit,
                })
            );

        const items =
            result.Items?.map((item) => {
                const { pk, sk, ...rest } = item;
                return rest;
            }) ?? [];

        return respond(200, {
            items,
            count: items.length,
            nextToken: encodeNextToken(result.LastEvaluatedKey),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unexpected error";
        return respond(500, { error: message });
    }
}