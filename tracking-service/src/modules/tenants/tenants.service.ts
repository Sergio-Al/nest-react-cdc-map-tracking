import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity';
import { isValidSlug, isReservedSlug } from './slug.util';

export type AvailabilityReason = 'invalid' | 'reserved' | 'taken';
export interface Availability {
  available: boolean;
  reason?: AvailabilityReason;
}

/** Registry for workspaces (tenants): availability checks + atomic creation. */
@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant, 'cacheDb')
    private readonly repo: Repository<Tenant>,
  ) {}

  /** Format → reserved → existence. Returns the first failing reason, if any. */
  async isAvailable(id: string): Promise<Availability> {
    if (!isValidSlug(id)) return { available: false, reason: 'invalid' };
    if (isReservedSlug(id)) return { available: false, reason: 'reserved' };
    const exists = await this.repo.exists({ where: { id } });
    return exists ? { available: false, reason: 'taken' } : { available: true };
  }

  /**
   * Atomically claim a workspace id. The PK makes concurrent claims race-safe:
   * the loser hits a unique violation, which we surface as workspaceTaken.
   */
  async create(input: { id: string; name: string; ownerEmail: string }): Promise<Tenant> {
    try {
      await this.repo.insert(input);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as any).code === '23505') {
        throw new ConflictException({ errorCode: 'auth.workspaceTaken', args: { id: input.id } });
      }
      throw err;
    }
    return this.repo.findOneByOrFail({ id: input.id });
  }
}
