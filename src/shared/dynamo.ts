import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const raw = new DynamoDBClient({});
export const dynamo = DynamoDBDocumentClient.from(raw);

export const TABLE = process.env.TASKS_TABLE!;
