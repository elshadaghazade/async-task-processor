import path from "node:path";
import swaggerJSDoc from 'swagger-jsdoc';
import config from '../config/env';

const isProd = process.env.NODE_ENV === "production";

const apis = isProd
  ? [path.join(process.cwd(), "dist/**/*.js")]
  : [path.join(process.cwd(), "src/**/*.ts")];

export const swaggerSpec = swaggerJSDoc({
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Async Task Processing API',
            version: '1.0.0',
            description: 'API documentation for Async Task Processing Service',
        },
        servers: [
            {
                url: `http://localhost:${config.server.port}`,
            },
        ],
    },
    apis
});