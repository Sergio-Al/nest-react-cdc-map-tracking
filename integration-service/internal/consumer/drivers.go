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

type driverData struct {
	ID           string  `json:"id"`
	TenantID     string  `json:"tenantId"`
	Name         string  `json:"name"`
	DeviceID     *string `json:"deviceId"`
	Phone        *string `json:"phone"`
	VehiclePlate *string `json:"vehiclePlate"`
	VehicleType  *string `json:"vehicleType"`
	Status       *string `json:"status"`
}

func handleDriver(ctx context.Context, msg kafka.Message, q *db.Queries, dlqWriter *kafka.Writer, stats *health.Stats) error {
	var cmd commandMessage
	if err := json.Unmarshal(msg.Value, &cmd); err != nil {
		slog.Error("invalid JSON in commands.drivers", "error", err, "offset", msg.Offset)
		return sendToDLQ(ctx, dlqWriter, msg, fmt.Sprintf("invalid JSON: %v", err))
	}

	if cmd.Op != "create" {
		slog.Warn("unhandled op on commands.drivers", "op", cmd.Op, "correlationId", cmd.CorrelationID)
		return sendToDLQ(ctx, dlqWriter, msg, fmt.Sprintf("unhandled op: %s", cmd.Op))
	}

	var data driverData
	if err := json.Unmarshal(cmd.Data, &data); err != nil {
		slog.Error("invalid driver data", "error", err, "correlationId", cmd.CorrelationID)
		return sendToDLQ(ctx, dlqWriter, msg, fmt.Sprintf("invalid data: %v", err))
	}

	vehicleType := "van"
	if data.VehicleType != nil {
		vehicleType = *data.VehicleType
	}
	status := "offline"
	if data.Status != nil {
		status = *data.Status
	}

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
		lastErr = q.InsertDriver(
			data.ID, data.TenantID, data.Name,
			data.DeviceID, data.Phone, data.VehiclePlate,
			vehicleType, status,
		)
		if lastErr == nil {
			slog.Info("driver created in MySQL",
				"correlationId", cmd.CorrelationID,
				"tenant", data.TenantID,
				"name", data.Name,
				"driverId", data.ID,
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

	slog.Error("exhausted retries for driver insert",
		"error", lastErr,
		"correlationId", cmd.CorrelationID,
	)
	return sendToDLQ(ctx, dlqWriter, msg, fmt.Sprintf("DB error after retries: %v", lastErr))
}
