import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { AckOnboardingDto } from './dto/ack-onboarding.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  // Current user's acknowledged/in-progress items, keyed by item_key.
  @Get('me/onboarding')
  getMine(@CurrentUser() user: any) {
    return this.onboardingService.getAllForUser(user.userId);
  }

  // Acknowledge / update progress on one item.
  @Put('me/onboarding/:key')
  ack(
    @CurrentUser() user: any,
    @Param('key') key: string,
    @Body() dto: AckOnboardingDto,
  ) {
    return this.onboardingService.ack(user.userId, user.tenantId, key, dto);
  }
}
