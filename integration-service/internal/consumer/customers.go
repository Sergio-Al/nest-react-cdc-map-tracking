package consumer

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"time"

	"github.com/segmentio/kafka-go"

	"github.com/sergio-al/integration-service/internal/db"
	"github.com/sergio-al/integration-service/internal/health"
)

// commandMessage is the envelope produced by the NestJS tracking-service.
type commandMessage struct {
	Op            string          `json:"op"`
	CorrelationID string          `json:"correlationId"`
	Data          json.RawMessage `json:"data"`
}

type customerData struct {
	TenantID             string   `json:"tenantId"`
	Name                 string   `json:"name"`
	Phone                *string  `json:"phone"`
	Email                *string  `json:"email"`
	Address              *string  `json:"address"`
	Latitude             *float64 `json:"latitude"`
	Longitude            *float64 `json:"longitude"`
	GeofenceRadiusMeters *int     `json:"geofenceRadiusMeters"`
	CustomerType         *string  `json:"customerType"`
}

func handleCustomer(ctx context.Context, msg kafka.Message, q *db.Queries, dlqWriter *kafka.Writer, stats *health.Stats) error {
	var cmd commandMessage
	if err := json.Unmarshal(msg.Value, &cmd); err != nil {
		slog.Error("invalid JSON in commands.customers", "error", err, "offset", msg.Offset)
		return sendToDLQ(ctx, dlqWriter, msg, fmt.Sprintf("invalid JSON: %v", err))
	}

	if cmd.Op != "create" {
		slog.Warn("unhandled op on commands.customers", "op", cmd.Op, "correlationId", cmd.CorrelationID)
		return sendToDLQ(ctx, dlqWriter, msg, fmt.Sprintf("unhandled op: %s", cmd.Op))
	}

	var data customerData
	if err := json.Unmarshal(cmd.Data, &data); err != nil {
		slog.Error("invalid customer data", "error", err, "correlationId", cmd.CorrelationID)
		return sendToDLQ(ctx, dlqWriter, msg, fmt.Sprintf("invalid data: %v", err))
	}

	geofence := 100
	if data.GeofenceRadiusMeters != nil {
		geofence = *data.GeofenceRadiusMeters
	}
	custType := "regular"
	if data.CustomerType != nil {
		custType = *data.CustomerType
	}

	// Retry up to 3 times with exponential backoff (300ms base).
	var lastErr error
	for attempt := 0; attempt <= 3; attempt++ {
		if attempt > 0 {
			delay := time.Duration(300*math.Pow(2, float64(attempt-1))) * time.Millisecond
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		_, lastErr = q.InsertCustomer(
			data.TenantID, data.Name,
			data.Phone, data.Email, data.Address,
			data.Latitude, data.Longitude,
			geofence, custType,
		)
		if lastErr == nil {
			slog.Info("customer created in MySQL",
				"correlationId", cmd.CorrelationID,
				"tenant", data.TenantID,
				"name", data.Name,
			)
			return nil
		}
		stats.AddDBError()
		slog.Warn("DB insert failed, retrying",
			"attempt", attempt+1,
			"error", lastErr,
			"correlationId", cmd.CorrelationID,
		)
	}

	slog.Error("exhausted retries for customer insert",
		"error", lastErr,
		"correlationId", cmd.CorrelationID,
	)
	return sendToDLQ(ctx, dlqWriter, msg, fmt.Sprintf("DB error after retries: %v", lastErr))
}
