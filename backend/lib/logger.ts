import pino from 'pino'

/**
 * Structured logger. In production (Vercel) we emit plain JSON lines. In dev we use
 * pino-pretty for readability. Both packages are marked external in next.config.ts so
 * Next's bundler leaves pino's worker-thread transport intact.
 */
const isDev = process.env.NODE_ENV === 'development'

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { service: 'wave-protocol' },
  ...(isDev
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
        },
      }
    : {}),
})
