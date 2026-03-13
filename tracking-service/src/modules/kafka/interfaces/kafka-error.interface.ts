/**
 * Structured error interface for Kafka message processing failures.
 * Used across all consumers for consistent error logging and DLQ metadata.
 */
export interface KafkaProcessingError {
  topic: string;
  partition: number;
  offset: string;
  key?: string;
  error: string;
  errorStack?: string;
  retryCount: number;
  sentToDlq: boolean;
  timestamp: string;
}

/**
 * Retry policy configuration for Kafka message handlers.
 */
export interface RetryPolicy {
  /** Maximum number of retry attempts before sending to DLQ (default: 3) */
  maxRetries: number;
  /** Base delay in ms for exponential backoff (default: 100) */
  baseDelayMs: number;
}

/**
 * Classifies an error as transient (retryable) or permanent (skip straight to DLQ).
 * Transient: connection errors, timeouts, temporary unavailability.
 * Permanent: parse errors, validation failures, malformed data.
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return true; // Unknown errors default to transient

  const message = error.message.toLowerCase();
  const name = error.name?.toLowerCase() ?? '';

  // Permanent errors — no point retrying
  const permanentPatterns = [
    'syntaxerror',
    'json',
    'unexpected token',
    'invalid',
    'validation',
    'not found',
    'null',
    'undefined',
    'cannot read',
    'type error',
  ];

  for (const pattern of permanentPatterns) {
    if (message.includes(pattern) || name.includes(pattern)) {
      return false;
    }
  }

  // Everything else is considered transient
  return true;
}
