import IORedis from 'ioredis';
import { logger } from './logger';
import config from './config/env';

export const redisConnection = new IORedis({
  host: config.redis.host,
  port: config.redis.port,
  maxRetriesPerRequest: null,
});

redisConnection.on('connect', () => {
  logger.info('Redis connected');
});

redisConnection.on('error', (err) => {
  logger.error({ err }, 'Redis connection error');
});
