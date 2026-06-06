import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// opossum ships as `export = CircuitBreaker` (CommonJS); this project has
// esModuleInterop off, so a default import is undefined at runtime. Use the
// import-equals form (same reason as the stripe SDK import).
import CircuitBreaker = require('opossum');

/** Minimal shape of a Traccar device we care about. */
interface TraccarDevice {
  id: number;
  name: string;
  uniqueId: string;
  disabled?: boolean;
  [k: string]: unknown;
}

/**
 * Thin REST client for the Traccar admin API (device CRUD), used to keep a
 * Traccar device in sync with a driver's `device_id` (Traccar `uniqueId` ===
 * `drivers.device_id` — the contract the position webhook + enrichment rely on).
 *
 * Every request goes through an opossum circuit breaker: when Traccar is down,
 * the breaker opens and calls fail fast (instead of hanging on a timeout), so
 * the BullMQ job fails immediately and is rescheduled with backoff rather than
 * hammering a dead server. Native `fetch` + Basic auth (the repo's outbound-HTTP
 * convention; no axios).
 */
@Injectable()
export class TraccarAdminService {
  private readonly logger = new Logger(TraccarAdminService.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly breaker: CircuitBreaker<[string, RequestInit?], Response>;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>('traccar.url') || 'http://localhost:8082').replace(/\/$/, '');
    const email = this.config.get<string>('traccar.adminEmail') || '';
    const password = this.config.get<string>('traccar.adminPassword') || '';
    this.authHeader = 'Basic ' + Buffer.from(`${email}:${password}`).toString('base64');

    this.breaker = new CircuitBreaker(
      (path: string, init?: RequestInit) => this.rawRequest(path, init),
      {
        timeout: 5000, // fail a request that hangs >5s
        errorThresholdPercentage: 50,
        resetTimeout: 30_000, // after opening, probe again in 30s (half-open)
        name: 'traccar-admin',
      },
    );
    this.breaker.on('open', () => this.logger.warn('Traccar circuit OPEN — failing fast'));
    this.breaker.on('halfOpen', () => this.logger.log('Traccar circuit HALF-OPEN — probing'));
    this.breaker.on('close', () => this.logger.log('Traccar circuit CLOSED — recovered'));
  }

  /**
   * Ensure a Traccar device exists for `uniqueId` and is enabled. Creates it if
   * missing; if present (possibly disabled from a prior deactivate), re-enables
   * it and refreshes the name. Idempotent.
   */
  async ensureDevice(uniqueId: string, name: string): Promise<void> {
    const existing = await this.findByUniqueId(uniqueId);
    if (!existing) {
      await this.request('/api/devices', {
        method: 'POST',
        body: JSON.stringify({ name, uniqueId }),
      });
      this.logger.log(`Traccar device created: ${uniqueId} (${name})`);
      return;
    }
    if (existing.disabled || existing.name !== name) {
      await this.request(`/api/devices/${existing.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...existing, name, disabled: false }),
      });
      this.logger.log(`Traccar device updated/enabled: ${uniqueId}`);
    }
  }

  /** Disable (not delete) the Traccar device for `uniqueId`. No-op if absent. */
  async disableDevice(uniqueId: string): Promise<void> {
    const existing = await this.findByUniqueId(uniqueId);
    if (!existing) return;
    if (existing.disabled) return;
    await this.request(`/api/devices/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify({ ...existing, disabled: true }),
    });
    this.logger.log(`Traccar device disabled: ${uniqueId}`);
  }

  private async findByUniqueId(uniqueId: string): Promise<TraccarDevice | null> {
    const res = await this.request(`/api/devices?uniqueId=${encodeURIComponent(uniqueId)}`);
    const list = (await res.json()) as TraccarDevice[];
    return Array.isArray(list) && list.length > 0 ? list[0] : null;
  }

  /** Run a request through the breaker; throws on non-2xx or when the circuit is open. */
  private async request(path: string, init?: RequestInit): Promise<Response> {
    return this.breaker.fire(path, init);
  }

  private async rawRequest(path: string, init?: RequestInit): Promise<Response> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: this.authHeader,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Traccar ${init?.method ?? 'GET'} ${path} → ${res.status}: ${body.slice(0, 200)}`);
    }
    return res;
  }
}
