/**
 * Haversine formula and geo utilities for geofence detection
 */

const EARTH_RADIUS_M = 6_371_000; // Earth's mean radius in meters

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate the distance in meters between two GPS coordinates using Haversine formula
 */
export function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Estimate time of arrival in seconds given distance (m) and speed (km/h)
 */
export function estimateEtaSeconds(distanceM: number, speedKmh: number): number | null {
  if (speedKmh <= 0) return null;
  const speedMs = speedKmh / 3.6;
  return Math.round(distanceM / speedMs);
}

/**
 * Check if a point is inside a circular geofence
 */
export function isInsideGeofence(
  lat: number,
  lon: number,
  fenceLat: number,
  fenceLon: number,
  radiusM: number,
): boolean {
  return haversineDistanceM(lat, lon, fenceLat, fenceLon) <= radiusM;
}
