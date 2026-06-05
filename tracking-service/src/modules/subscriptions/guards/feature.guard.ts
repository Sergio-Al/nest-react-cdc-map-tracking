import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_FEATURE_KEY } from '../decorators/requires-feature.decorator';
import { EntitlementsService } from '../entitlements.service';

/**
 * Enforces @RequiresFeature(code) against the tenant's plan. Runs after
 * JwtAuthGuard (which populates request.user), so the tenant is known. Routes
 * without the decorator pass through untouched. Throws 403 featureNotInPlan.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string>(REQUIRES_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.tenantId) return false;

    // Throws ForbiddenException (403) when the plan lacks the feature.
    await this.entitlements.assertFeature(user.tenantId, feature);
    return true;
  }
}
