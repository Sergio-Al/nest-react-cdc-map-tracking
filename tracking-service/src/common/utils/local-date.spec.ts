import { localDate } from './local-date';

describe('localDate', () => {
  it('returns the La Paz civil date after the UTC rollover (20:00–24:00 local)', () => {
    // 2026-09-28T00:30Z is still Sep 27, 20:30 in La Paz (UTC−4).
    expect(localDate('America/La_Paz', new Date('2026-09-28T00:30:00Z'))).toBe('2026-09-27');
  });

  it('matches the UTC date when both days agree', () => {
    expect(localDate('America/La_Paz', new Date('2026-09-27T15:00:00Z'))).toBe('2026-09-27');
    expect(localDate('UTC', new Date('2026-09-28T00:30:00Z'))).toBe('2026-09-28');
  });
});
