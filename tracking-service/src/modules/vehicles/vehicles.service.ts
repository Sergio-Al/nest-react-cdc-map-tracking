import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { Vehicle } from './entities/vehicle.entity'
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

@Injectable()
export class VehiclesService {
  private readonly logger = new Logger(VehiclesService.name);

  constructor(
    @InjectRepository(Vehicle, 'cacheDb')
    private readonly vehicleRepo: Repository<Vehicle>,
  ) {}

  async create(dto: CreateVehicleDto): Promise<Vehicle> {
    const existing = await this.vehicleRepo.findOne({
      where: { tenantId: dto.tenantId, plate: dto.plate },
    });
    if (existing) {
      throw new ConflictException(`Vehicle with plate ${dto.plate} already exists`);
    }
    const vehicle = this.vehicleRepo.create(dto);
    const saved = await this.vehicleRepo.save(vehicle);
    this.logger.log(`Vehicle created: ${saved.id} plate=${saved.plate}`);
    return saved;
  }

  async findAll(tenantId: string): Promise<Vehicle[]> {
    return this.vehicleRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async search(tenantId: string, query: {
    plate?: string;
    type?: string;
    status?: string;
    driverId?: string;
    brand?: string;
  }): Promise<Vehicle[]> {
    const where: FindOptionsWhere<Vehicle> = { tenantId };
    if (query.type)     where.type = query.type;
    if (query.status)   where.status = query.status;
    if (query.driverId) where.driverId = query.driverId;
    if (query.plate)    where.plate = ILike(`%${query.plate}%`);
    if (query.brand)    where.brand = ILike(`%${query.brand}%`);
    return this.vehicleRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Vehicle> {
    const vehicle = await this.vehicleRepo.findOne({ where: { id } });
    if (!vehicle) throw new NotFoundException(`Vehicle ${id} not found`);
    return vehicle;
  }

  async update(id: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    const vehicle = await this.findOne(id);
    Object.assign(vehicle, dto);
    return this.vehicleRepo.save(vehicle);
  }
}
