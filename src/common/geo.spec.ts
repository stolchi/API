import { describe, expect, it } from 'vitest';
import { distanceKm, roughly } from './geo.js';

describe('geo', () => {
  it('measures straight-line distance', () => {
    // Chorsu to Amir Temur square, Tashkent: about 3.4 km.
    const km = distanceKm(
      { latitude: 41.3265, longitude: 69.2353 },
      { latitude: 41.3111, longitude: 69.2797 },
    );
    expect(km).toBeGreaterThan(3.5);
    expect(km).toBeLessThan(4.2);
    expect(
      distanceKm(
        { latitude: 41, longitude: 69 },
        { latitude: 41, longitude: 69 },
      ),
    ).toBe(0);
  });

  it('blurs a point to about half a kilometre', () => {
    expect(roughly({ latitude: 41.285601, longitude: 69.203412 })).toEqual({
      latitude: 41.285,
      longitude: 69.205,
    });
  });
});
