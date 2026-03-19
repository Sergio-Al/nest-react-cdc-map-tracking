package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/sergio-al/integration-service/internal/config"
	"github.com/sergio-al/integration-service/internal/consumer"
	"github.com/sergio-al/integration-service/internal/db"
	"github.com/sergio-al/integration-service/internal/health"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	mysqlDB, err := db.Open(cfg.MySQLDSN)
	if err != nil {
		slog.Error("failed to connect to MySQL", "error", err)
		os.Exit(1)
	}
	defer mysqlDB.Close()
	slog.Info("connected to MySQL")

	queries, err := db.PrepareQueries(mysqlDB)
	if err != nil {
		slog.Error("failed to prepare queries", "error", err)
		os.Exit(1)
	}
	defer queries.Close()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	stats := health.NewStats()

	// Start health/metrics HTTP server in background.
	go func() {
		addr := ":" + cfg.HTTPPort
		slog.Info("health server listening", "addr", addr)
		if err := health.Serve(addr, stats); err != nil {
			slog.Error("health server error", "error", err)
		}
	}()

	slog.Info("starting Kafka consumers",
		"broker", cfg.KafkaBroker,
		"group", cfg.KafkaGroupID,
	)

	// Blocks until ctx is cancelled (SIGINT/SIGTERM).
	if err := consumer.Run(ctx, cfg.KafkaBroker, cfg.KafkaGroupID, queries, stats); err != nil {
		slog.Error("consumer runner error", "error", err)
		os.Exit(1)
	}

	slog.Info("integration-service stopped")
}
