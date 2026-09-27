import { haversineDistanceM, estimateEtaSeconds, isInsideGeofence } from './geo-utils';

// La Paz reference points used across the fixtures
const PLAZA_MURILLO = { lat: -16.4957, lon: -68.1335 };

describe('geo-utils', () => {
  // ── haversineDistanceM ───────────────────────────────────

  describe('haversineDistanceM', () => {
    it('returns 0 for the same point', () => {
      expect(
        haversineDistanceM(PLAZA_MURILLO.lat, PLAZA_MURILLO.lon, PLAZA_MURILLO.lat, PLAZA_MURILLO.lon),
      ).toBe(0);
    });

    it('computes ~111.2 km for 1 degree of latitude', () => {
      const d = haversineDistanceM(-16.5, -68.15, -17.5, -68.15);
      expect(d).toBeGreaterThan(110_000);
      expect(d).toBeLessThan(112_500);
    });

    it('computes ~1.11 km for 0.01 degrees of latitude', () => {
      const d = haversineDistanceM(-16.5, -68.15, -16.51, -68.15);
      expect(d).toBeCloseTo(1112, -1); // within ~5 m
    });

    it('is symmetric', () => {
      const a = haversineDistanceM(-16.5, -68.15, -16.52, -68.1);
      const b = haversineDistanceM(-16.52, -68.1, -16.5, -68.15);
      expect(a).toBeCloseTo(b, 6);
    });
  });

  // ── estimateEtaSeconds ───────────────────────────────────

  describe('estimateEtaSeconds', () => {
    it('returns null when speed is zero (stopped vehicle)', () => {
      expect(estimateEtaSeconds(1000, 0)).toBeNull();
    });

    it('returns null for negative speed', () => {
      expect(estimateEtaSeconds(1000, -5)).toBeNull();
    });

    it('computes eta for a moving vehicle (36 km/h = 10 m/s)', () => {
      expect(estimateEtaSeconds(1000, 36)).toBe(100);
    });

    it('rounds to whole seconds', () => {
      // 100 m at 36 km/h (10 m/s) = 10 s; 105 m → 10.5 s → rounds to 11
      expect(estimateEtaSeconds(105, 36)).toBe(11);
    });
  });

  // ── isInsideGeofence ─────────────────────────────────────

  describe('isInsideGeofence', () => {
    it('is inside when standing at the fence center', () => {
      expect(isInsideGeofence(-16.5, -68.15, -16.5, -68.15, 100)).toBe(true);
    });

    it('is inside just within the radius', () => {
      // ~55 m north of center, 100 m radius
      expect(isInsideGeofence(-16.4995, -68.15, -16.5, -68.15, 100)).toBe(true);
    });

    it('is outside beyond the radius', () => {
      // ~1.1 km away, 100 m radius
      expect(isInsideGeofence(-16.51, -68.15, -16.5, -68.15, 100)).toBe(false);
    });

    it('treats the exact boundary as inside (<=)', () => {
      const center = { lat: -16.5, lon: -68.15 };
      const point = { lat: -16.4995, lon: -68.15 };
      const exact = haversineDistanceM(point.lat, point.lon, center.lat, center.lon);
      expect(isInsideGeofence(point.lat, point.lon, center.lat, center.lon, exact)).toBe(true);
    });
  });
});
