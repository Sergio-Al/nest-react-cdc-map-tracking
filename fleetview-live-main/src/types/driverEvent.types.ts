export interface DriverEvent {
  id: string;
  type: 'shift_start' | 'arrived' | 'completed' | 'departed' | 'skipped' | 'failed' | 'idle' | 'speeding';
  time: string;
  customerName?: string;
  durationSec?: number;
  speedKmh?: number;
}
