import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserOnboardingState } from './entities/user-onboarding-state.entity';
import { AckOnboardingDto } from './dto/ack-onboarding.dto';

/** Compact per-item shape returned to the client (keyed by item_key). */
export interface OnboardingItemState {
  status: string;
  step: number | null;
  seenAt: Date | null;
}

@Injectable()
export class OnboardingService {
  constructor(
    @InjectRepository(UserOnboardingState, 'cacheDb')
    private readonly repo: Repository<UserOnboardingState>,
  ) {}

  /** All acknowledged/in-progress items for a user, keyed by item_key. */
  async getAllForUser(userId: string): Promise<Record<string, OnboardingItemState>> {
    const rows = await this.repo.find({ where: { userId } });
    return rows.reduce<Record<string, OnboardingItemState>>((acc, row) => {
      acc[row.itemKey] = { status: row.status, step: row.step, seenAt: row.seenAt };
      return acc;
    }, {});
  }

  /**
   * Record progress/acknowledgement for one item (find-or-create then save,
   * mirroring SettingsService.updateUser). A step-only update (no `status`)
   * keeps the current status — it must NOT mark the item acknowledged; new
   * rows then start as 'pending'.
   */
  async ack(
    userId: string,
    tenantId: string,
    itemKey: string,
    dto: AckOnboardingDto,
  ): Promise<OnboardingItemState> {
    const existing = await this.repo.findOne({ where: { userId, itemKey } });
    const row = existing ?? this.repo.create({ userId, itemKey });
    row.tenantId = tenantId; // keep ownership consistent
    row.status = dto.status ?? existing?.status ?? 'pending';
    if (dto.step !== undefined) row.step = dto.step;
    row.seenAt = new Date();
    const saved = await this.repo.save(row);
    return { status: saved.status, step: saved.step, seenAt: saved.seenAt };
  }
}
