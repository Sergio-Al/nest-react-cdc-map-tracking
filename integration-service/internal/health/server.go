package health

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"
)

// Stats tracks operational metrics exposed via /metrics.
type Stats struct {
	mu        sync.RWMutex
	processed map[string]int64
	dlqSends  int64
	dbErrors  int64
	startTime time.Time
}

func NewStats() *Stats {
	return &Stats{
		processed: make(map[string]int64),
		startTime: time.Now(),
	}
}

func (s *Stats) AddProcessed(topic string) {
	s.mu.Lock()
	s.processed[topic]++
	s.mu.Unlock()
}

func (s *Stats) AddDLQSend() {
	atomic.AddInt64(&s.dlqSends, 1)
}

func (s *Stats) AddDBError() {
	atomic.AddInt64(&s.dbErrors, 1)
}

func (s *Stats) snapshot() (map[string]int64, int64, int64, time.Duration) {
	s.mu.RLock()
	cp := make(map[string]int64, len(s.processed))
	for k, v := range s.processed {
		cp[k] = v
	}
	s.mu.RUnlock()
	return cp, atomic.LoadInt64(&s.dlqSends), atomic.LoadInt64(&s.dbErrors), time.Since(s.startTime)
}

// Serve starts the HTTP health/metrics server (blocks).
func Serve(addr string, stats *Stats) error {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":  "ok",
			"service": "integration-service",
		})
	})

	mux.HandleFunc("GET /metrics", func(w http.ResponseWriter, _ *http.Request) {
		processed, dlq, dbErr, uptime := stats.snapshot()
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		fmt.Fprintf(w, "# integration-service metrics\n")
		fmt.Fprintf(w, "uptime_seconds %.0f\n", uptime.Seconds())
		for topic, count := range processed {
			fmt.Fprintf(w, "messages_processed{topic=%q} %d\n", topic, count)
		}
		fmt.Fprintf(w, "dlq_sends_total %d\n", dlq)
		fmt.Fprintf(w, "db_errors_total %d\n", dbErr)
	})

	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  5 * time.Second,
		WriteTimeout: 5 * time.Second,
	}
	return srv.ListenAndServe()
}
