import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Driver, DriverPosition } from './entities';
import { EnrichmentService } from '../enrichment/enrichment.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

/**
 * Drivers are PostgreSQL-owned (source of truth). Writes go straight to the
 * `tracking_cache.drivers` table — NOT through Kafka/MySQL/CDC — mirroring the
 * users cut-over. After every mutation we refresh the in-memory device→driver
 * map in EnrichmentService so live GPS enrichment stays correct without a
 * restart (the role the CDC consumer used to play).
 */
@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    @InjectRepository(Driver, 'cacheDb')
    private readonly driverRepo: Repository<Driver>,

    @InjectRepository(DriverPosition, 'cacheDb')
    private readonly positionRepo: Repository<DriverPosition>,

    private readonly enrichment: EnrichmentService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async findAll(tenantId?: string): Promise<Driver[]> {
    if (tenantId) {
      return this.driverRepo.find({ where: { tenantId } });
    }
    return this.driverRepo.find();
  }

  async findOne(id: string): Promise<Driver | null> {
    return this.driverRepo.findOne({ where: { id } });
  }

  async findByDeviceId(deviceId: string): Promise<Driver | null> {
    return this.driverRepo.findOne({ where: { deviceId } });
  }

  async getLatestPositions(tenantId?: string): Promise<DriverPosition[]> {
    if (tenantId) {
      return this.positionRepo.find({ where: { tenantId } });
    }
    return this.positionRepo.find();
  }

  /** Create a driver directly in PG (synchronous). Returns the created row. */
  async createDriver(dto: CreateDriverDto): Promise<Driver> {
    // Seat gate: a driver = a billable seat. Throws 402 when at/over the plan cap.
    await this.entitlements.assertCanAddDriver(dto.tenantId);
    if (dto.deviceId) {
      await this.assertDeviceFree(dto.deviceId, null);
    }
    const driver = this.driverRepo.create(dto);
    let saved: Driver;
    try {
      saved = await this.driverRepo.save(driver);
    } catch (err) {
      throw this.translateDeviceConflict(err, dto.deviceId ?? null);
    }
    this.enrichment.refreshDriverMapping(
      saved.deviceId,
      saved.id,
      saved.tenantId,
      saved.name,
    );
    this.logger.log(`Driver created: ${saved.id} name=${saved.name}`);
    return saved;
  }

  /** Update driver fields. Re-syncs the enrichment map if device/name change. */
  async updateDriver(
    id: string,
    tenantId: string,
    dto: UpdateDriverDto,
  ): Promise<Driver> {
    const driver = await this.getOwned(id, tenantId);

    const deviceChanged =
      dto.deviceId !== undefined && dto.deviceId !== driver.deviceId;
    if (deviceChanged && dto.deviceId) {
      await this.assertDeviceFree(dto.deviceId, id);
    }

    Object.assign(driver, dto);
    let saved: Driver;
    try {
      saved = await this.driverRepo.save(driver);
    } catch (err) {
      throw this.translateDeviceConflict(err, dto.deviceId ?? null);
    }

    if (deviceChanged || dto.name !== undefined) {
      this.enrichment.refreshDriverMapping(
        saved.deviceId,
        saved.id,
        saved.tenantId,
        saved.name,
      );
    }
    return saved;
  }

  /**
   * Soft delete: mark inactive and clear the device pairing so the driver
   * stops matching live GPS. The row (and its routes/visits history) is kept.
   * Reactivate via updateDriver({ status }) + re-pair.
   */
  async deactivateDriver(id: string, tenantId: string): Promise<Driver> {
    const driver = await this.getOwned(id, tenantId);
    driver.status = 'inactive';
    driver.deviceId = null;
    const saved = await this.driverRepo.save(driver);
    this.enrichment.removeDriverMapping(id);
    this.logger.log(`Driver deactivated: ${id}`);
    return saved;
  }

  /** Bind (or clear, with null) a device_id to a driver. */
  async pairDevice(
    id: string,
    tenantId: string,
    deviceId: string | null,
  ): Promise<Driver> {
    const driver = await this.getOwned(id, tenantId);
    if (deviceId) {
      await this.assertDeviceFree(deviceId, id);
    }
    driver.deviceId = deviceId;
    let saved: Driver;
    try {
      saved = await this.driverRepo.save(driver);
    } catch (err) {
      throw this.translateDeviceConflict(err, deviceId);
    }
    this.enrichment.refreshDriverMapping(
      saved.deviceId,
      saved.id,
      saved.tenantId,
      saved.name,
    );
    this.logger.log(`Driver ${id} device set to ${deviceId ?? 'none'}`);
    return saved;
  }

  async upsertPosition(
    driverId: string,
    tenantId: string,
    data: Partial<DriverPosition>,
  ): Promise<void> {
    await this.positionRepo.upsert(
      {
        driverId,
        tenantId,
        latitude: data.latitude!,
        longitude: data.longitude!,
        speed: data.speed ?? 0,
        heading: data.heading ?? 0,
        altitude: data.altitude ?? 0,
        accuracy: data.accuracy ?? null,
        updatedAt: new Date(),
      },
      ['driverId'],
    );
  }

  // ── helpers ──────────────────────────────────────────────

  /** Fetch a tenant-scoped driver or throw 404 (blocks cross-tenant edits). */
  private async getOwned(id: string, tenantId: string): Promise<Driver> {
    const driver = await this.driverRepo.findOne({ where: { id, tenantId } });
    if (!driver) {
      throw new NotFoundException({ errorCode: 'drivers.notFound', args: { id } });
    }
    return driver;
  }

  /** Pre-check that a device_id is unbound (or bound to `ownerId`). */
  private async assertDeviceFree(
    deviceId: string,
    ownerId: string | null,
  ): Promise<void> {
    const existing = await this.findByDeviceId(deviceId);
    if (existing && existing.id !== ownerId) {
      throw new ConflictException({
        errorCode: 'drivers.deviceInUse',
        args: { deviceId },
      });
    }
  }

  /** Map the PG unique-violation (23505) backstop to the i18n conflict error. */
  private translateDeviceConflict(err: unknown, deviceId: string | null): unknown {
    if (
      err instanceof QueryFailedError &&
      (err as any).code === '23505' &&
      deviceId
    ) {
      return new ConflictException({
        errorCode: 'drivers.deviceInUse',
        args: { deviceId },
      });
    }
    return err;
  }
}
