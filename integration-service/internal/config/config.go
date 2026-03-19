package config

import (
	"fmt"
	"os"
	"strconv"
)

type Config struct {
	KafkaBroker  string
	KafkaGroupID string
	MySQLDSN     string
	HTTPPort     string
}

func Load() (*Config, error) {
	host := envOrDefault("MYSQL_HOST", "mysql")
	port := envOrDefault("MYSQL_PORT", "3306")
	user := envOrDefault("MYSQL_USER", "app_user")
	pass := envOrDefault("MYSQL_PASSWORD", "app_secret")
	db := envOrDefault("MYSQL_DATABASE", "core_business")

	mysqlPort, err := strconv.Atoi(port)
	if err != nil {
		return nil, fmt.Errorf("invalid MYSQL_PORT %q: %w", port, err)
	}

	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true&charset=utf8mb4&collation=utf8mb4_unicode_ci",
		user, pass, host, mysqlPort, db)

	return &Config{
		KafkaBroker:  envOrDefault("KAFKA_BROKER", "kafka:9092"),
		KafkaGroupID: envOrDefault("KAFKA_GROUP_ID", "integration-service-group"),
		MySQLDSN:     dsn,
		HTTPPort:     envOrDefault("HTTP_PORT", "8090"),
	}, nil
}

func envOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
