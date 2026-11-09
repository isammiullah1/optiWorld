import winston from 'winston';

export type RecentError = {
  at: string;
  message: string;
};

const ERROR_LIMIT = 20;
const recentErrorLog: RecentError[] = [];

const rememberErrors = winston.format((info) => {
  if (info.level === 'error') {
    const message = typeof info.message === 'string' ? info.message : 'Error';
    recentErrorLog.unshift({ at: new Date().toISOString(), message: message.slice(0, 300) });
    if (recentErrorLog.length > ERROR_LIMIT) {
      recentErrorLog.length = ERROR_LIMIT;
    }
  }
  return info;
});

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    rememberErrors(),
    winston.format.timestamp(),
    winston.format.json(),
  ),
  transports: [new winston.transports.Console()],
});

export function recentErrors(): readonly RecentError[] {
  return recentErrorLog;
}
