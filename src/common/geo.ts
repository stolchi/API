export interface Point {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
const radians = (degrees: number) => (degrees * Math.PI) / 180;

/** Straight-line distance in kilometres (haversine), to one decimal. */
export function distanceKm(a: Point, b: Point): number {
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(a.latitude)) *
      Math.cos(radians(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h)) * 10) / 10;
}

/** A point blurred to a grid of about half a kilometre: the area, not the door. */
export const roughly = ({ latitude, longitude }: Point): Point => ({
  latitude: Math.round(latitude * 200) / 200,
  longitude: Math.round(longitude * 200) / 200,
});
