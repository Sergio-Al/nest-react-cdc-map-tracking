export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  kafka: {
    broker: process.env.KAFKA_BROKER || 'localhost:9094',
    clientId: process.env.KAFKA_CLIENT_ID || 'tracking-service',
    groupId: process.env.KAFKA_GROUP_ID || 'tracking-service-group',
  },

  cacheDb: {
    host: process.env.CACHE_DB_HOST || 'localhost',
    port: parseInt(process.env.CACHE_DB_PORT || '5432', 10),
    database: process.env.CACHE_DB_NAME || 'tracking_cache',
    username: process.env.CACHE_DB_USER || 'tracking',
    password: process.env.CACHE_DB_PASSWORD || 'tracking_secret',
  },

  timescale: {
    host: process.env.TIMESCALE_HOST || 'localhost',
    port: parseInt(process.env.TIMESCALE_PORT || '5433', 10),
    database: process.env.TIMESCALE_DB || 'tracking_history',
    username: process.env.TIMESCALE_USER || 'timescale',
    password: process.env.TIMESCALE_PASSWORD || 'timescale_secret',
  },

  mysql: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    database: process.env.MYSQL_DATABASE || 'core_business',
    username: process.env.MYSQL_USER || 'app_user',
    password: process.env.MYSQL_PASSWORD || 'app_secret',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || 'redis_secret',
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || '7d',
    refreshExpiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    traccarApiKey: process.env.TRACCAR_API_KEY || 'traccar-shared-key',
  },
});
