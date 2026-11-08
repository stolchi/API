import type { Place } from '../src/geo/nominatim.js';

/** Stands in for OpenStreetMap's search, and counts how often it was asked. */
export class FakeNominatim {
  calls: { query: string; near?: { latitude: number; longitude: number } }[] =
    [];

  search(
    query: string,
    near?: { latitude: number; longitude: number },
  ): Promise<Place[]> {
    this.calls.push({ query, near });
    return Promise.resolve([
      { name: `${query}, O'zbekiston`, latitude: 40.38, longitude: 71.78 },
    ]);
  }
}
