import express from 'express';
import { logger } from './lib/logger';
import config from './lib/config/env';

const app = express();
const PORT = config.server.port;

app.use(express.json());

app.use((req, _res, next) => {
    logger.info({ method: req.method, path: req.path }, 'Incoming request');
    next();
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    logger.info({ port: PORT }, 'API server started');
});