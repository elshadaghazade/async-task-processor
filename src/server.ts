import express from 'express';
import { logger } from './lib/logger';
import config from './lib/config/env';
import { tasksRouter } from './api/tasks.router';
import { swaggerSpec } from './lib/swagger';
import swaggerUi from 'swagger-ui-express';

const app = express();
const PORT = config.server.port;

app.use(express.json());

app.use((req, _res, next) => {
    logger.info({ method: req.method, path: req.path }, 'Incoming request');
    next();
});

app.use('/api/v1', tasksRouter);

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.listen(PORT, () => {
    logger.info({ port: PORT }, 'API server started');
});