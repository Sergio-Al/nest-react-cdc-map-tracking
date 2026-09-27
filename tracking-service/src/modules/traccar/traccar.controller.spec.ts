import { Test, TestingModule } from '@nestjs/testing';
import { TraccarController } from './traccar.controller';
import { TraccarIngestionService } from './traccar-ingestion.service';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';

describe('TraccarController', () => {
  let controller: TraccarController;
  let ingestion: { handlePosition: jest.Mock; handlePositionBatch: jest.Mock };

  beforeEach(async () => {
    ingestion = {
      handlePosition: jest.fn().mockResolvedValue(undefined),
      handlePositionBatch: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TraccarController],
      providers: [{ provide: TraccarIngestionService, useValue: ingestion }],
    })
      .overrideGuard(ApiKeyGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(TraccarController);
  });

  describe('speed units', () => {
    it('converts Traccar PositionData speed from knots to km/h', async () => {
      await controller.receivePositions({
        position: { id: 1, deviceId: 7, latitude: -16.5, longitude: -68.13, speed: 10 },
        device: { uniqueId: 'DEV001' },
      });

      const forwarded = ingestion.handlePosition.mock.calls[0][0];
      expect(forwarded.speed).toBeCloseTo(18.52);
      expect(forwarded.deviceId).toBe('DEV001');
      expect(forwarded.attributes.uniqueId).toBe('DEV001');
    });

    it('converts every position in a forwarded PositionData array', async () => {
      await controller.receivePositions([
        { position: { deviceId: 7, latitude: -16.5, longitude: -68.13, speed: 5 }, device: { uniqueId: 'DEV001' } },
        { position: { deviceId: 8, latitude: -16.5, longitude: -68.13, speed: 0 }, device: { uniqueId: 'DEV002' } },
      ]);

      const batch = ingestion.handlePositionBatch.mock.calls[0][0];
      expect(batch.map((p: { speed: number }) => p.speed)).toEqual([5 * 1.852, 0]);
    });

    it('passes flat (manual / load-test) positions through unchanged — already km/h', async () => {
      await controller.receivePositions({
        deviceId: 'LOAD0001',
        latitude: -16.5,
        longitude: -68.13,
        speed: 40,
      });

      expect(ingestion.handlePosition.mock.calls[0][0].speed).toBe(40);
    });
  });
});
