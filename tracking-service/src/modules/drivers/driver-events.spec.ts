import {
  buildDriverEvents,
  positionEvents,
  visitEvents,
  IDLE_MIN_SEC,
  SPEEDING_KMH,
  VisitTimes,
  PositionSample,
} from './driver-events';

const T0 = new Date('2026-09-26T12:00:00Z').getTime();
const at = (sec: number) => new Date(T0 + sec * 1000);
const DAY_FROM = new Date('2026-09-26T04:00:00Z');
const DAY_TO = new Date('2026-09-27T03:59:59Z');

/** Positions every `step` s from `start` for `count` fixes at `speed` km/h. */
function run(start: number, count: number, speed: number, step = 10): PositionSample[] {
  return Array.from({ length: count }, (_, i) => ({ time: at(start + i * step), speed }));
}

function visit(overrides: Partial<VisitTimes> = {}): VisitTimes {
  return {
    id: 'v1',
    status: 'completed',
    customerName: 'Libreria Gisbert',
    arrivedAt: null,
    completedAt: null,
    departedAt: null,
    ...overrides,
  };
}

describe('driver events', () => {
  describe('visitEvents', () => {
    it('emits arrived, completed (with time on site) and departed', () => {
      const events = visitEvents(
        [visit({ arrivedAt: at(0), completedAt: at(300), departedAt: at(330) })],
        DAY_FROM,
        DAY_TO,
      );

      expect(events.map((e) => e.type)).toEqual(['arrived', 'completed', 'departed']);
      expect(events[1]).toMatchObject({ customerName: 'Libreria Gisbert', durationSec: 300 });
    });

    it('reports skipped/failed visits at their close-out time instead of "departed"', () => {
      const events = visitEvents(
        [
          visit({ id: 'a', status: 'skipped', departedAt: at(60) }),
          visit({ id: 'b', status: 'failed', arrivedAt: at(100), departedAt: at(200) }),
        ],
        DAY_FROM,
        DAY_TO,
      );

      expect(events.map((e) => e.type)).toEqual(['skipped', 'arrived', 'failed']);
    });

    it('ignores timestamps outside the requested window', () => {
      const yesterday = new Date(DAY_FROM.getTime() - 3600_000);
      expect(visitEvents([visit({ arrivedAt: yesterday })], DAY_FROM, DAY_TO)).toEqual([]);
    });
  });

  describe('positionEvents', () => {
    it('marks the first fix as shift start', () => {
      const events = positionEvents(run(0, 3, 30), []);
      expect(events).toEqual([expect.objectContaining({ type: 'shift_start', time: at(0).toISOString() })]);
    });

    it('detects an idle stretch of at least 5 minutes away from any stop', () => {
      const positions = [...run(0, 5, 30), ...run(50, 40, 0), ...run(450, 5, 30)];

      const idle = positionEvents(positions, []).filter((e) => e.type === 'idle');

      expect(idle).toHaveLength(1);
      expect(idle[0].time).toBe(at(50).toISOString());
      expect(idle[0].durationSec).toBeGreaterThanOrEqual(IDLE_MIN_SEC);
    });

    it('does not report short stops (traffic lights) as idle', () => {
      const positions = [...run(0, 5, 30), ...run(50, 10, 0), ...run(150, 5, 30)];
      expect(positionEvents(positions, []).some((e) => e.type === 'idle')).toBe(false);
    });

    it('does not report parking at a customer as idle', () => {
      const positions = [...run(0, 5, 30), ...run(50, 60, 0), ...run(650, 5, 30)];
      const visits = [visit({ arrivedAt: at(60), completedAt: at(600), departedAt: at(640) })];

      expect(positionEvents(positions, visits).some((e) => e.type === 'idle')).toBe(false);
    });

    it('keeps the on-site window open after completion until the driver departs', () => {
      // Completed at 300 s but still parked (no departure yet) → not idle.
      const positions = [...run(0, 5, 30), ...run(50, 60, 0)];
      const visits = [visit({ arrivedAt: at(60), completedAt: at(300), departedAt: null })];

      expect(positionEvents(positions, visits, at(700)).some((e) => e.type === 'idle')).toBe(false);
    });

    it('breaks idle stretches across device gaps (phone off is not idling)', () => {
      const positions = [...run(0, 2, 0), ...run(2000, 2, 0)];
      expect(positionEvents(positions, []).some((e) => e.type === 'idle')).toBe(false);
    });

    it('reports one speeding event per run at its peak speed', () => {
      const positions = [
        ...run(0, 3, 40),
        { time: at(30), speed: SPEEDING_KMH + 5 },
        { time: at(40), speed: SPEEDING_KMH + 12 },
        { time: at(50), speed: SPEEDING_KMH + 3 },
        ...run(60, 3, 40),
      ];

      const speeding = positionEvents(positions, []).filter((e) => e.type === 'speeding');

      expect(speeding).toEqual([
        expect.objectContaining({ time: at(40).toISOString(), speedKmh: SPEEDING_KMH + 12 }),
      ]);
    });

    it('ignores a single-fix speed spike (GPS noise)', () => {
      const positions = [...run(0, 3, 40), { time: at(30), speed: 120 }, ...run(40, 3, 40)];
      expect(positionEvents(positions, []).some((e) => e.type === 'speeding')).toBe(false);
    });
  });

  it('merges everything newest first', () => {
    const events = buildDriverEvents(
      [visit({ arrivedAt: at(100), completedAt: at(200), departedAt: at(230) })],
      run(0, 30, 30),
      DAY_FROM,
      DAY_TO,
    );

    expect(events.map((e) => e.type)).toEqual(['departed', 'completed', 'arrived', 'shift_start']);
  });
});
