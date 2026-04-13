"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/list_tasks/handler.ts
var handler_exports = {};
__export(handler_exports, {
  handler: () => handler
});
module.exports = __toCommonJS(handler_exports);
var import_lib_dynamodb2 = require("@aws-sdk/lib-dynamodb");

// src/shared/dynamo.ts
var import_client_dynamodb = require("@aws-sdk/client-dynamodb");
var import_lib_dynamodb = require("@aws-sdk/lib-dynamodb");
var raw = new import_client_dynamodb.DynamoDBClient({});
var dynamo = import_lib_dynamodb.DynamoDBDocumentClient.from(raw);
var TABLE = process.env.TASKS_TABLE;

// src/shared/respond.ts
var respond = (statusCode, body) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body)
});

// src/list_tasks/handler.ts
var ALLOWED_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"];
var DEFAULT_LIMIT = 20;
var MAX_LIMIT = 100;
var parseLimit = (raw2) => {
  const n = Number(raw2);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(n), MAX_LIMIT);
};
var decodeNextToken = (token) => {
  if (!token) return void 0;
  try {
    return JSON.parse(Buffer.from(token, "base64").toString("utf8"));
  } catch {
    throw new Error("Invalid nextToken");
  }
};
var encodeNextToken = (key) => {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64");
};
var handler = async (event, _context) => {
  try {
    const query = event.queryStringParameters ?? {};
    const status = query.status;
    const limit = parseLimit(query.limit);
    const nextToken = decodeNextToken(query.nextToken);
    if (status && !ALLOWED_STATUSES.includes(status)) {
      return respond(400, {
        error: `Invalid status. Allowed values: ${ALLOWED_STATUSES.join(", ")}`
      });
    }
    const result = status ? await dynamo.send(
      new import_lib_dynamodb2.QueryCommand({
        TableName: TABLE,
        IndexName: "status-created-index",
        KeyConditionExpression: "#status = :status",
        ExpressionAttributeNames: {
          "#status": "status"
        },
        ExpressionAttributeValues: {
          ":status": status
        },
        ExclusiveStartKey: nextToken,
        Limit: limit,
        ScanIndexForward: false
      })
    ) : await dynamo.send(
      new import_lib_dynamodb2.ScanCommand({
        TableName: TABLE,
        FilterExpression: "#sk = :detail",
        ExpressionAttributeNames: {
          "#sk": "sk"
        },
        ExpressionAttributeValues: {
          ":detail": "DETAIL"
        },
        ExclusiveStartKey: nextToken,
        Limit: limit
      })
    );
    const items = result.Items?.map((item) => {
      const { pk, sk, ...rest } = item;
      return rest;
    }) ?? [];
    return respond(200, {
      items,
      count: items.length,
      nextToken: encodeNextToken(result.LastEvaluatedKey)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return respond(500, { error: message });
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
