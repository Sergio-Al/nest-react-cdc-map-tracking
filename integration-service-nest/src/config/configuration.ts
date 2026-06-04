export default () => ({
  httpPort: parseInt(process.env.HTTP_PORT || '8090', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

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
