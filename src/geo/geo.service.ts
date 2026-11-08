import { Injectable } from '@nestjs/common';
import { Nominatim, type Place } from './nominatim.js';

const CACHE_SIZE = 500;
const CACHE_MS = 24 * 60 * 60 * 1000;

/** Searches for places, remembering answers: addresses do not move in a day. */
@Injectable()
export class GeoService {
  private readonly cache = new Map<string, { at: number; places: Place[] }>();

  constructor(private readonly nominatim: Nominatim) {}

  async search(
    query: string,
    near?: { latitude: number; longitude: number },
  ): Promise<Place[]> {
    const key = [
      query.trim().toLowerCase().replace(/\s+/g, ' '),
      // About a district: close enough to share an answer.
      near ? `${near.latitude.toFixed(1)},${near.longitude.toFixed(1)}` : '',
    ].join('|');
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.places;

    const places = await this.nominatim.search(query.trim(), near);
    this.cache.delete(key);
    this.cache.set(key, { at: Date.now(), places });
    // Map keeps insertion order: the first key is the oldest.
    if (this.cache.size > CACHE_SIZE) {
      this.cache.delete(this.cache.keys().next().value as string);
    }
    return places;
  }
}
