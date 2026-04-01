import express from 'express';
import config from './lib/config/env';

const app = express();
const PORT = config.server.port;

app.use(express.json());

app.use((req, _res, next) => {
    console.log({ method: req.method, path: req.path }, 'Incoming request');
    next();
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log({ port: PORT }, 'API server started');
});