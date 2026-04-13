import type { APIGatewayProxyResultV2 } from "aws-lambda/trigger/api-gateway-proxy";

export const respond = (statusCode: number, body: unknown): APIGatewayProxyResultV2 => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});