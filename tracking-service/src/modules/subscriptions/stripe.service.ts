import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe = require('stripe');

// The stripe package ships as `export = StripeConstructor`, whose namespace only
// re-exports the instance type — the rich `Stripe.Event`/`Stripe.Subscription`
// types aren't reachable by name under CommonJS resolution. So derive them from
// the SDK's own inference instead of naming the namespace.
export type StripeClient = Stripe.Stripe;
export type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;

/**
 * Thin wrapper around the Stripe SDK. Holds the configured client and verifies
 * webhook signatures. Stripe is OPTIONAL in local dev: when no secret key /
 * webhook secret is configured, `configured` is false and the webhook endpoint
 * returns 503 instead of pretending to work.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly client: StripeClient | null;
  private readonly webhookSecret: string;

  constructor(private readonly config: ConfigService) {
    const secretKey = this.config.get<string>('stripe.secretKey') || '';
    this.webhookSecret = this.config.get<string>('stripe.webhookSecret') || '';
    this.client = secretKey ? new Stripe(secretKey) : null;
    if (!this.client) {
      this.logger.warn('Stripe not configured (STRIPE_SECRET_KEY unset) — billing webhook disabled');
    }
  }

  /** Whether Stripe is usable (both the API key and the webhook secret are set). */
  get configured(): boolean {
    return !!this.client && !!this.webhookSecret;
  }

  /**
   * Verify a webhook signature and return the parsed event. `payload` MUST be
   * the raw request body bytes (req.rawBody), not the JSON-parsed object.
   * Throws if Stripe is not configured or the signature is invalid.
   */
  constructEvent(payload: Buffer, signature: string): StripeEvent {
    if (!this.client || !this.webhookSecret) {
      throw new ServiceUnavailableException({ errorCode: 'subscriptions.billingNotConfigured' });
    }
    return this.client.webhooks.constructEvent(payload, signature, this.webhookSecret);
  }

  /** The configured client, or throw 503 if Stripe isn't set up. */
  private requireClient(): StripeClient {
    if (!this.client) {
      throw new ServiceUnavailableException({ errorCode: 'subscriptions.billingNotConfigured' });
    }
    return this.client;
  }

  /** Create a Stripe customer for a tenant; returns the customer id. */
  async createCustomer(tenantId: string, email?: string): Promise<string> {
    const customer = await this.requireClient().customers.create({
      email,
      metadata: { tenantId },
    });
    return customer.id;
  }

  /**
   * Create a subscription Checkout Session. `tenantId` is stamped on both the
   * session (client_reference_id + metadata) and the resulting subscription, so
   * the webhook can map events back to the tenant. Returns the hosted URL.
   */
  async createCheckoutSession(params: {
    customerId: string;
    priceId: string;
    quantity: number;
    tenantId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const session = await this.requireClient().checkout.sessions.create({
      mode: 'subscription',
      customer: params.customerId,
      line_items: [{ price: params.priceId, quantity: Math.max(1, params.quantity) }],
      client_reference_id: params.tenantId,
      metadata: { tenantId: params.tenantId },
      subscription_data: { metadata: { tenantId: params.tenantId } },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
    });
    return session.url ?? '';
  }

  /** Create a Billing Portal session for self-serve management; returns the URL. */
  async createBillingPortalSession(customerId: string, returnUrl: string): Promise<string> {
    const session = await this.requireClient().billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
    });
    return session.url;
  }
}
