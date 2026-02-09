import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Driver, DriverPosition } from './entities';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    @InjectRepository(Driver, 'cacheDb')
    private readonly driverRepo: Repository<Driver>,

    @InjectRepository(DriverPosition, 'cacheDb')
    private readonly positionRepo: Repository<DriverPosition>,
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
}
