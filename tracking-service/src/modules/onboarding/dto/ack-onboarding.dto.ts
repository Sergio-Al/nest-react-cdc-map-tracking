import { IsOptional, IsIn, IsInt, Min } from 'class-validator';

/**
 * Acknowledge (or update progress on) an onboarding item. Both fields
 * optional: `status` omitted defaults to 'completed' in the service;
 * `step` records the resume point for multi-step flows.
 */
export class AckOnboardingDto {
  @IsOptional()
  @IsIn(['pending', 'completed', 'dismissed', 'snoozed'])
  status?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  step?: number;
}
