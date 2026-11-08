import { describe, expect, it } from 'vitest';
import { placesOf } from './nominatim.js';

describe('placesOf', () => {
  it("reads Nominatim's places and drops broken ones", () => {
    expect(
      placesOf([
        { display_name: "Farg'ona, O'zbekiston", lat: '40.38', lon: '71.78' },
        { display_name: 'No point', lat: 'x', lon: '71' },
        { lat: '40', lon: '71' },
      ]),
    ).toEqual([
      { name: "Farg'ona, O'zbekiston", latitude: 40.38, longitude: 71.78 },
    ]);
    expect(placesOf({ error: 'nope' })).toEqual([]);
  });
});
