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

// src/get_task/handler.ts
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

// src/get_task/handler.ts
var handler = async (event, _context) => {
  const taskId = event.pathParameters?.task_id;
  if (!taskId) {
    return respond(400, { error: "task_id path parameter is required" });
  }
  const result = await dynamo.send(
    new import_lib_dynamodb2.GetCommand({
      TableName: TABLE,
      Key: { pk: `TASK#${taskId}`, sk: "DETAIL" }
    })
  );
  if (!result.Item) {
    return respond(404, { error: `Task ${taskId} not found` });
  }
  const { pk, sk, ...item } = result.Item;
  return respond(200, item);
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
