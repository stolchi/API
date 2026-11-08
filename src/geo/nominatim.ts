import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface Place {
  /** How OpenStreetMap names it, most specific part first. */
  name: string;
  latitude: number;
  longitude: number;
}

/** OpenStreetMap asks for at most one request a second from one application. */
const MIN_GAP_MS = 1100;
const SEARCH_URL = 'https://nominatim.openstreetmap.org/search';

interface NominatimHit {
  display_name?: unknown;
  lat?: unknown;
  lon?: unknown;
}

/** Turns Nominatim's answer into places, dropping anything malformed. */
export function placesOf(body: unknown): Place[] {
  if (!Array.isArray(body)) return [];
  return (body as NominatimHit[]).flatMap((hit) => {
    const latitude = Number(hit.lat);
    const longitude = Number(hit.lon);
    if (
      typeof hit.display_name !== 'string' ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return [];
    }
    return [{ name: hit.display_name, latitude, longitude }];
  });
}

/**
 * OpenStreetMap's place search, which is free on its terms: name the app, at most one
 * request a second. Calls wait their turn here, so the cafes together keep to it.
 */
@Injectable()
export class Nominatim {
  private queue: Promise<unknown> = Promise.resolve();
  private last = 0;

  search(query: string, near?: { latitude: number; longitude: number }) {
    const run = this.queue.then(async () => {
      const wait = this.last + MIN_GAP_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.last = Date.now();
      return this.fetchPlaces(query, near);
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async fetchPlaces(
    query: string,
    near?: { latitude: number; longitude: number },
  ): Promise<Place[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      countrycodes: 'uz',
      limit: '6',
      'accept-language': 'uz,ru',
    });
    if (near) {
      // Prefers places around the cafe, without hiding the rest of the country.
      const box = [
        near.longitude - 0.4,
        near.latitude + 0.3,
        near.longitude + 0.4,
        near.latitude - 0.3,
      ];
      params.set('viewbox', box.join(','));
    }
    const response = await fetch(`${SEARCH_URL}?${params}`, {
      headers: { 'User-Agent': 'Stolchi/1.0 (https://stolchi.uz)' },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!response?.ok) {
      throw new ServiceUnavailableException('Place search is unavailable');
    }
    return placesOf(await response.json());
  }
}
