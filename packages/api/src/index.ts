import { createServer } from 'node:http';

import { createApp } from './app.js';
import { getEnv } from './config/env.js';
import { logger } from './lib/logger.js';
import { attachOrderChat } from './realtime/server.js';

const env = getEnv();
const app = createApp();
const server = createServer(app);
attachOrderChat(server);

server.listen(env.API_PORT, () => {
  logger.info('API listening', { port: env.API_PORT });
});
