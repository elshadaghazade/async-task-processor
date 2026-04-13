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

// src/fail_task/handler.ts
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

// src/fail_task/handler.ts
var extractErrorReason = (error) => {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const obj = error;
    if (typeof obj.Cause === "string") return obj.Cause;
    if (typeof obj.cause === "string") return obj.cause;
    if (typeof obj.Error === "string") return obj.Error;
    if (typeof obj.error === "string") return obj.error;
    if (typeof obj.message === "string") return obj.message;
    return JSON.stringify(obj);
  }
  return String(error);
};
var handler = async (event, _context) => {
  console.log("Failing task:", JSON.stringify(event, null, 2));
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const errorReason = extractErrorReason(event.error);
  await dynamo.send(
    new import_lib_dynamodb2.UpdateCommand({
      TableName: TABLE,
      Key: {
        pk: `TASK#${event.taskId}`,
        sk: "DETAIL"
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
        "#error_reason": "error"
      },
      ExpressionAttributeValues: {
        ":status": "FAILED",
        ":updated_at": now,
        ":failed_at": now,
        ":error_reason": errorReason
      },
      ConditionExpression: "attribute_exists(pk) AND attribute_exists(sk)"
    })
  );
  return {
    ...event,
    status: "FAILED",
    failed_at: now,
    error_reason: errorReason
  };
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  handler
});
