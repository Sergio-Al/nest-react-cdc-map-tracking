package consumer

import (
	"context"
	"fmt"
	"log/slog"
	"sync"

	"github.com/segmentio/kafka-go"

	"github.com/sergio-al/integration-service/internal/db"
	"github.com/sergio-al/integration-service/internal/health"
)

// topicHandler maps a topic → its handler + DLQ writer.
type topicHandler struct {
	topic     string
	dlqTopic  string
	handler   func(ctx context.Context, msg kafka.Message, q *db.Queries, dlq *kafka.Writer, stats *health.Stats) error
}

var topics = []topicHandler{
	{
		topic:    "commands.customers",
		dlqTopic: "commands.customers.dlq",
		handler:  handleCustomer,
	},
	{
		topic:    "commands.drivers",
		dlqTopic: "commands.drivers.dlq",
		handler:  handleDriver,
	},
}

// Run starts one goroutine per topic reader and blocks until ctx is cancelled.
// It returns after all readers have drained and closed.
func Run(ctx context.Context, broker, groupID string, q *db.Queries, stats *health.Stats) error {
	var wg sync.WaitGroup

	for _, th := range topics {
		reader := kafka.NewReader(kafka.ReaderConfig{
			Brokers:  []string{broker},
			GroupID:  groupID,
			Topic:    th.topic,
			MinBytes: 1,
			MaxBytes: 10e6, // 10 MB
		})

		dlqWriter := &kafka.Writer{
			Addr:     kafka.TCP(broker),
			Topic:    th.dlqTopic,
			Balancer: &kafka.LeastBytes{},
		}

		wg.Add(1)
		go func(th topicHandler, r *kafka.Reader, dw *kafka.Writer) {
			defer wg.Done()
			defer r.Close()
			defer dw.Close()
			consumeLoop(ctx, r, q, dw, th, stats)
		}(th, reader, dlqWriter)

		slog.Info("consumer started", "topic", th.topic, "group", groupID)
	}

	wg.Wait()
	return nil
}

func consumeLoop(ctx context.Context, r *kafka.Reader, q *db.Queries, dw *kafka.Writer, th topicHandler, stats *health.Stats) {
	for {
		msg, err := r.FetchMessage(ctx)
		if err != nil {
			if ctx.Err() != nil {
				slog.Info("consumer shutting down", "topic", th.topic)
				return
			}
			slog.Error("fetch error", "topic", th.topic, "error", err)
			continue
		}

		if err := th.handler(ctx, msg, q, dw, stats); err != nil {
			slog.Error("handler error", "topic", th.topic, "error", err)
		}

		stats.AddProcessed(th.topic)

		if err := r.CommitMessages(ctx, msg); err != nil {
			slog.Error("commit error", "topic", th.topic, "error", err)
		}
	}
}

func sendToDLQ(ctx context.Context, w *kafka.Writer, original kafka.Message, reason string) error {
	err := w.WriteMessages(ctx, kafka.Message{
		Key:   original.Key,
		Value: original.Value,
		Headers: []kafka.Header{
			{Key: "dlq-reason", Value: []byte(reason)},
			{Key: "original-topic", Value: []byte(original.Topic)},
		},
	})
	if err != nil {
		slog.Error("failed to send to DLQ", "topic", w.Topic, "error", err)
		return fmt.Errorf("DLQ send: %w", err)
	}
	slog.Warn("message sent to DLQ", "topic", w.Topic, "reason", reason)
	return nil
}
