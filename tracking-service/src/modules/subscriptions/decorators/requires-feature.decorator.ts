import { SetMetadata } from '@nestjs/common';

export const REQUIRES_FEATURE_KEY = 'requiresFeature';

/**
 * Marks a route as requiring a plan feature code (e.g. 'route_optimization',
 * 'reports', 'api_access'). Enforced by FeatureGuard against the tenant's
 * resolved entitlements. Apply with `@UseGuards(FeatureGuard)` on the
 * controller/handler (SubscriptionsModule must be imported there).
 */
export const RequiresFeature = (feature: string) => SetMetadata(REQUIRES_FEATURE_KEY, feature);
