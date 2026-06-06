export default () => ({
  httpPort: parseInt(process.env.HTTP_PORT || '8090', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Local disk logging via Pino (nestjs-pino + pino-roll). Files are written to
  // `dir` (relative to the container WORKDIR = /app) and rotated when they reach
  // `maxSize` OR every `rotateIntervalMs`, whichever first; only the newest
  // `retainCount` rotated files are kept. This service runs in Docker, so JSON is
  // always emitted to stdout too (for `docker logs`); in dev (NODE_ENV != production)
  // the stdout stream is pretty-printed instead. Mount /app/logs to persist files.
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    dir: process.env.LOG_DIR || 'logs',
    file: process.env.LOG_FILE || 'integration-service.log',
    maxSize: process.env.LOG_MAX_SIZE || '1m',
    rotateIntervalMs: parseInt(process.env.LOG_ROTATE_INTERVAL_MS || '259200000', 10), // 3 days
    retainCount: parseInt(process.env.LOG_RETAIN_COUNT || '20', 10),
    pretty: (process.env.NODE_ENV || 'development') !== 'production',
  },

  kafka: {
    // In Docker this service talks to the internal broker listener (kafka:9092).
    broker: process.env.KAFKA_BROKER || 'kafka:9092',
    clientId: process.env.KAFKA_CLIENT_ID || 'integration-service',
    groupId: process.env.KAFKA_GROUP_ID || 'integration-service-group',
  },

  mysql: {
    host: process.env.MYSQL_HOST || 'mysql',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    database: process.env.MYSQL_DATABASE || 'core_business',
    username: process.env.MYSQL_USER || 'app_user',
    password: process.env.MYSQL_PASSWORD || 'app_secret',
  },
});
