import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { DriversService } from './drivers.service';
import { Driver, DriverPosition } from './entities';
import { EnrichmentService } from '../enrichment/enrichment.service';
import { EntitlementsService } from '../subscriptions/entitlements.service';
import { TraccarProvisioningService } from '../traccar/traccar-provisioning.service';
import { AuthService } from '../auth/auth.service';

function makeDriver(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'drv-1',
    tenantId: 'tenant-1',
    name: 'Juan Pérez',
    deviceId: 'DEV001',
    status: 'active',
    ...overrides,
  } as Driver;
}

describe('DriversService', () => {
  let service: DriversService;
  let driverRepo: { find: jest.Mock; findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let positionRepo: { find: jest.Mock; upsert: jest.Mock };
  let enrichment: { refreshDriverMapping: jest.Mock; removeDriverMapping: jest.Mock };
  let entitlements: { assertCanAddDriver: jest.Mock };
  let traccar: { ensureDevice: jest.Mock; disableDevice: jest.Mock };
  let authService: { createDriverLogin: jest.Mock; driverIdsWithLogin: jest.Mock };

  beforeEach(async () => {
    driverRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d) => d),
      save: jest.fn(async (d) => d),
    };
    positionRepo = {
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue(undefined),
    };
    enrichment = { refreshDriverMapping: jest.fn(), removeDriverMapping: jest.fn() };
    entitlements = { assertCanAddDriver: jest.fn().mockResolvedValue(undefined) };
    traccar = {
      ensureDevice: jest.fn().mockResolvedValue(undefined),
      disableDevice: jest.fn().mockResolvedValue(undefined),
    };
    authService = {
      createDriverLogin: jest.fn().mockResolvedValue({ id: 'user-9' }),
      driverIdsWithLogin: jest.fn().mockResolvedValue(new Set()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        { provide: getRepositoryToken(Driver, 'cacheDb'), useValue: driverRepo },
        { provide: getRepositoryToken(DriverPosition, 'cacheDb'), useValue: positionRepo },
        { provide: EnrichmentService, useValue: enrichment },
        { provide: EntitlementsService, useValue: entitlements },
        { provide: TraccarProvisioningService, useValue: traccar },
        { provide: AuthService, useValue: authService },
      ],
    }).compile();

    service = module.get(DriversService);
  });

  /** Route tenant-scoped findOne (getOwned) vs device lookups (assertDeviceFree). */
  function mockOwnedDriver(driver: Driver, deviceOwner: Driver | null = null) {
    driverRepo.findOne.mockImplementation(async ({ where }: any) =>
      where.deviceId !== undefined ? deviceOwner : driver,
    );
  }

  // ── startup reconciliation ───────────────────────────────

  describe('onModuleInit', () => {
    it('re-ensures Traccar devices for paired non-inactive drivers only', async () => {
      driverRepo.find.mockResolvedValue([
        makeDriver({ id: 'drv-1', deviceId: 'DEV001' }),
        makeDriver({ id: 'drv-2', deviceId: null }),
      ]);

      await service.onModuleInit();

      expect(traccar.ensureDevice).toHaveBeenCalledTimes(1);
      expect(traccar.ensureDevice).toHaveBeenCalledWith('DEV001', 'Juan Pérez');
    });
  });

  // ── reads ────────────────────────────────────────────────

  describe('findAll', () => {
    it('annotates each driver with whether it has a login account', async () => {
      driverRepo.find.mockResolvedValue([makeDriver({ id: 'drv-1' }), makeDriver({ id: 'drv-2' })]);
      authService.driverIdsWithLogin.mockResolvedValue(new Set(['drv-2']));

      const result = await service.findAll('tenant-1');

      expect(result.map((d) => d.hasLogin)).toEqual([false, true]);
      expect(driverRepo.find).toHaveBeenCalledWith({ where: { tenantId: 'tenant-1' } });
    });
  });

  describe('findOne', () => {
    it('404s on a cross-tenant or missing id instead of leaking the row', async () => {
      await expect(service.findOne('drv-1', 'other-tenant')).rejects.toThrow(NotFoundException);
    });
  });

  // ── createDriver ─────────────────────────────────────────

  describe('createDriver', () => {
    const dto = { tenantId: 'tenant-1', name: 'Ana Rojas', deviceId: 'DEV002' } as any;

    it('checks the seat entitlement, saves, refreshes the enrichment map and provisions Traccar', async () => {
      driverRepo.save.mockImplementation(async (d) => ({ ...d, id: 'drv-new' }));

      const saved = await service.createDriver(dto);

      expect(entitlements.assertCanAddDriver).toHaveBeenCalledWith('tenant-1');
      expect(enrichment.refreshDriverMapping).toHaveBeenCalledWith(
        'DEV002',
        'drv-new',
        'tenant-1',
        'Ana Rojas',
      );
      expect(traccar.ensureDevice).toHaveBeenCalledWith('DEV002', 'Ana Rojas');
      expect(saved.id).toBe('drv-new');
    });

    it('propagates the seat-cap rejection without saving', async () => {
      entitlements.assertCanAddDriver.mockRejectedValue(new Error('402 seat cap'));

      await expect(service.createDriver(dto)).rejects.toThrow('402 seat cap');
      expect(driverRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a device already paired to another driver', async () => {
      driverRepo.findOne.mockResolvedValue(makeDriver({ id: 'other-driver', deviceId: 'DEV002' }));

      await expect(service.createDriver(dto)).rejects.toThrow(ConflictException);
      expect(driverRepo.save).not.toHaveBeenCalled();
    });

    it('skips Traccar provisioning for a driver created without a device', async () => {
      await service.createDriver({ tenantId: 'tenant-1', name: 'Sin Equipo' } as any);

      expect(traccar.ensureDevice).not.toHaveBeenCalled();
    });

    it('translates the PG unique-violation race (23505) into deviceInUse', async () => {
      const driverError: any = new Error('duplicate key');
      driverError.code = '23505';
      driverRepo.save.mockRejectedValue(new QueryFailedError('INSERT', [], driverError));

      await expect(service.createDriver(dto)).rejects.toThrow(ConflictException);
    });
  });

  // ── updateDriver ─────────────────────────────────────────

  describe('updateDriver', () => {
    it('re-syncs enrichment and Traccar when the device changes', async () => {
      mockOwnedDriver(makeDriver({ deviceId: 'DEV001' }));

      await service.updateDriver('drv-1', 'tenant-1', { deviceId: 'DEV009' } as any);

      expect(enrichment.refreshDriverMapping).toHaveBeenCalledWith(
        'DEV009',
        'drv-1',
        'tenant-1',
        'Juan Pérez',
      );
      expect(traccar.disableDevice).toHaveBeenCalledWith('DEV001');
      expect(traccar.ensureDevice).toHaveBeenCalledWith('DEV009', 'Juan Pérez');
    });

    it('refreshes the existing Traccar device on a name-only change', async () => {
      mockOwnedDriver(makeDriver());

      await service.updateDriver('drv-1', 'tenant-1', { name: 'Juan P. Actualizado' } as any);

      expect(enrichment.refreshDriverMapping).toHaveBeenCalled();
      expect(traccar.disableDevice).not.toHaveBeenCalled();
      expect(traccar.ensureDevice).toHaveBeenCalledWith('DEV001', 'Juan P. Actualizado');
    });

    it('leaves enrichment and Traccar alone for unrelated field changes', async () => {
      mockOwnedDriver(makeDriver());

      await service.updateDriver('drv-1', 'tenant-1', { status: 'break' } as any);

      expect(enrichment.refreshDriverMapping).not.toHaveBeenCalled();
      expect(traccar.ensureDevice).not.toHaveBeenCalled();
      expect(traccar.disableDevice).not.toHaveBeenCalled();
    });

    it('rejects re-pairing to a device owned by another driver', async () => {
      mockOwnedDriver(makeDriver(), makeDriver({ id: 'other-driver', deviceId: 'DEV009' }));

      await expect(
        service.updateDriver('drv-1', 'tenant-1', { deviceId: 'DEV009' } as any),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── deactivateDriver / pairDevice ────────────────────────

  describe('deactivateDriver', () => {
    it('soft-deletes: inactive status, cleared pairing, map removal, Traccar disable', async () => {
      mockOwnedDriver(makeDriver({ deviceId: 'DEV001' }));

      const saved = await service.deactivateDriver('drv-1', 'tenant-1');

      expect(saved.status).toBe('inactive');
      expect(saved.deviceId).toBeNull();
      expect(enrichment.removeDriverMapping).toHaveBeenCalledWith('drv-1');
      expect(traccar.disableDevice).toHaveBeenCalledWith('DEV001');
    });
  });

  describe('pairDevice', () => {
    it('pairs a device and disables the previously paired one', async () => {
      mockOwnedDriver(makeDriver({ deviceId: 'DEV001' }));

      const saved = await service.pairDevice('drv-1', 'tenant-1', 'DEV009');

      expect(saved.deviceId).toBe('DEV009');
      expect(traccar.disableDevice).toHaveBeenCalledWith('DEV001');
      expect(traccar.ensureDevice).toHaveBeenCalledWith('DEV009', 'Juan Pérez');
      expect(enrichment.refreshDriverMapping).toHaveBeenCalledWith(
        'DEV009',
        'drv-1',
        'tenant-1',
        'Juan Pérez',
      );
    });

    it('clears the pairing with null and only disables the old device', async () => {
      mockOwnedDriver(makeDriver({ deviceId: 'DEV001' }));

      const saved = await service.pairDevice('drv-1', 'tenant-1', null);

      expect(saved.deviceId).toBeNull();
      expect(traccar.disableDevice).toHaveBeenCalledWith('DEV001');
      expect(traccar.ensureDevice).not.toHaveBeenCalled();
      expect(enrichment.refreshDriverMapping).toHaveBeenCalledWith(
        null,
        'drv-1',
        'tenant-1',
        'Juan Pérez',
      );
    });

    it('rejects a device already bound to another driver', async () => {
      mockOwnedDriver(makeDriver(), makeDriver({ id: 'other-driver', deviceId: 'DEV009' }));

      await expect(service.pairDevice('drv-1', 'tenant-1', 'DEV009')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ── provisionAppDevice (driver mobile app) ───────────────

  describe('provisionAppDevice', () => {
    it('mints a stable APP-<driverId> device for an unpaired driver and pairs it', async () => {
      mockOwnedDriver(makeDriver({ deviceId: null }));

      const result = await service.provisionAppDevice('drv-1', 'tenant-1');

      expect(result).toEqual({ deviceId: 'APP-drv-1' });
      expect(driverRepo.save).toHaveBeenCalled();
      expect(traccar.ensureDevice).toHaveBeenCalledWith('APP-drv-1', 'Juan Pérez');
    });

    it('is idempotent for an already-paired driver: keeps the id, only re-ensures Traccar', async () => {
      mockOwnedDriver(makeDriver({ deviceId: 'DEV001' }));

      const result = await service.provisionAppDevice('drv-1', 'tenant-1');

      expect(result).toEqual({ deviceId: 'DEV001' });
      expect(driverRepo.save).not.toHaveBeenCalled();
      expect(traccar.ensureDevice).toHaveBeenCalledWith('DEV001', 'Juan Pérez');
    });
  });

  // ── createLogin ──────────────────────────────────────────

  describe('createLogin', () => {
    it('delegates to AuthService with the tenant-owned driver name', async () => {
      mockOwnedDriver(makeDriver());

      await service.createLogin('drv-1', 'tenant-1', {
        email: 'juan@tenant1.com',
        password: 'secret123',
      } as any);

      expect(authService.createDriverLogin).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        driverId: 'drv-1',
        name: 'Juan Pérez',
        email: 'juan@tenant1.com',
        password: 'secret123',
      });
    });

    it('404s before creating a login for a cross-tenant driver', async () => {
      await expect(
        service.createLogin('drv-1', 'other-tenant', { email: 'x@x.com', password: 'p' } as any),
      ).rejects.toThrow(NotFoundException);
      expect(authService.createDriverLogin).not.toHaveBeenCalled();
    });
  });
});
