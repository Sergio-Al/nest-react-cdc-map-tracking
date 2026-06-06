export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // Deployment-default IANA timezone. Used as the bucket tz for the
  // `driver_daily_stats` continuous aggregate (one tz per deployment) and as
  // the system-default tenant timezone. Keep in sync with the value baked into
  // infrastructure/timescale/init/01-init.sql.
  defaultTz: process.env.DEFAULT_TZ || 'America/La_Paz',

  // Local disk logging via Pino (nestjs-pino + pino-roll). Files are written to
  // `dir` (relative to the process CWD = tracking-service/) and rotated when they
  // reach `maxSize` OR every `rotateIntervalMs`, whichever comes first; only the
  // newest `retainCount` rotated files are kept (oldest auto-deleted). In dev a
  // pretty console transport is added on top of the file; prod writes JSON only.
  logging: {
    level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
    dir: process.env.LOG_DIR || 'logs',
    file: process.env.LOG_FILE || 'tracking-service.log',
    maxSize: process.env.LOG_MAX_SIZE || '1m',
    rotateIntervalMs: parseInt(process.env.LOG_ROTATE_INTERVAL_MS || '259200000', 10), // 3 days
    retainCount: parseInt(process.env.LOG_RETAIN_COUNT || '20', 10),
    pretty: (process.env.NODE_ENV || 'development') !== 'production',
  },

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

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || 'redis_secret',
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-please',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.REFRESH_EXPIRES_IN || '7d',
    refreshExpiresInMs: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    traccarApiKey: process.env.TRACCAR_API_KEY || 'traccar-shared-key',
  },

  optimization: {
    osrmUrl: process.env.OSRM_URL || 'http://localhost:5003',
    orToolsUrl: process.env.OR_TOOLS_URL || 'http://localhost:5002',
  },

  // Traccar REST admin client — used to auto-provision a Traccar device
  // (uniqueId === driver.device_id) when a device is assigned to a driver.
  // tracking-service runs locally, so the default URL is localhost:8082.
  traccar: {
    url: process.env.TRACCAR_URL || 'http://localhost:8082',
    adminEmail: process.env.TRACCAR_ADMIN_EMAIL || 'admin@example.com',
    adminPassword: process.env.TRACCAR_ADMIN_PASSWORD || 'admin',
    provisioningEnabled: (process.env.TRACCAR_PROVISIONING_ENABLED ?? 'true') !== 'false',
  },

  // Stripe billing. secretKey/webhookSecret empty in local dev (billing
  // endpoints then return 503). secretKey: server API key; webhookSecret: the
  // signing secret for /api/subscriptions/webhook (whsec_…). trial* govern the
  // reverse-trial; checkout/portal URLs are where Stripe redirects back to.
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    trialDays: parseInt(process.env.TRIAL_DAYS || '14', 10),
    trialPlan: process.env.TRIAL_PLAN || 'growth',
    checkoutSuccessUrl:
      process.env.STRIPE_CHECKOUT_SUCCESS_URL || 'http://localhost:5173/settings?checkout=success',
    checkoutCancelUrl:
      process.env.STRIPE_CHECKOUT_CANCEL_URL || 'http://localhost:5173/settings?checkout=cancel',
    portalReturnUrl: process.env.STRIPE_PORTAL_RETURN_URL || 'http://localhost:5173/settings',
  },
});
