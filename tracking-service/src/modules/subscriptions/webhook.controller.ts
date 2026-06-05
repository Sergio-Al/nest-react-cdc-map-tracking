import {
  Controller,
  Post,
  Req,
  Headers,
  BadRequestException,
  Logger,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { StripeService, StripeEvent } from './stripe.service';
import { BillingService } from './billing.service';

/**
 * Stripe billing webhook. Public (no JWT) — authenticity comes from the Stripe
 * signature, verified against the raw request body (req.rawBody, enabled by
 * `rawBody: true` in main.ts). Always ACKs 200 once the signature checks out,
 * even for unhandled event types, so Stripe stops retrying; a bad/missing
 * signature is the only 400.
 */
@Controller('subscriptions')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly stripe: StripeService,
    private readonly billing: BillingService,
  ) {}

  @Public()
  @Post('webhook')
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: true }> {
    if (!req.rawBody) {
      throw new BadRequestException({ errorCode: 'subscriptions.webhookNoBody' });
    }

    let event: StripeEvent;
    try {
      event = this.stripe.constructEvent(req.rawBody, signature);
    } catch (err) {
      // Invalid signature, or Stripe not configured (ServiceUnavailableException).
      this.logger.warn(`Stripe webhook rejected: ${(err as Error).message}`);
      throw new BadRequestException({ errorCode: 'subscriptions.webhookSignatureInvalid' });
    }

    // Never let a handler error bubble as a 500 — that makes Stripe retry a
    // poison event forever. Log and ACK; redelivery is idempotent anyway.
    try {
      await this.billing.applyEvent(event);
    } catch (err) {
      this.logger.error(`Stripe event ${event.type} (${event.id}) failed: ${(err as Error).message}`);
    }
    return { received: true };
  }
}
