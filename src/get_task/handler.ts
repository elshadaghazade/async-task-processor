import { APIGatewayProxyEventV2, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { dynamo, TABLE } from "../shared/dynamo";
import { respond } from "../shared/respond";

export const handler = async (
    event: APIGatewayProxyEventV2,
    _context: Context
): Promise<APIGatewayProxyResultV2> => {
    const taskId = event.pathParameters?.task_id;

    if (!taskId) {
        return respond(400, { error: "task_id path parameter is required" });
    }

    const result = await dynamo.send(
        new GetCommand({
            TableName: TABLE,
            Key: { pk: `TASK#${taskId}`, sk: "DETAIL" },
        })
    );

    if (!result.Item) {
        return respond(404, { error: `Task ${taskId} not found` });
    }

    const { pk, sk, ...item } = result.Item;

    return respond(200, item);
};
