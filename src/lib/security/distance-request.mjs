import { createHash } from 'node:crypto';

export const DISTANCE_ADDRESS_MAX_LENGTH = 300;
export const DISTANCE_BODY_MAX_BYTES = 2_048;
export const DISTANCE_EXTERNAL_TIMEOUT_MS = 5_000;
export const ALLOWED_DISTANCE_PROFILES = new Set(['driving-car']);

export function normalizeDistanceAddress(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function validateDistancePayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const origin = normalizeDistanceAddress(body.origin);
  const destination = normalizeDistanceAddress(body.destination);
  const profile = String(body.profile || 'driving-car');
  if (
    origin.length < 8 || destination.length < 8 ||
    origin.length > DISTANCE_ADDRESS_MAX_LENGTH || destination.length > DISTANCE_ADDRESS_MAX_LENGTH ||
    !ALLOWED_DISTANCE_PROFILES.has(profile)
  ) return null;
  return { origin, destination, profile };
}

export function createDistanceCacheKey(origin, destination, profile) {
  return createHash('sha256')
    .update(`${normalizeDistanceAddress(origin).toLowerCase()}\n${normalizeDistanceAddress(destination).toLowerCase()}\n${profile}`)
    .digest('hex');
}

export function createDistanceRateKey(userId, ip) {
  return createHash('sha256').update(`${userId}\n${ip}`).digest('hex');
}

export function isAuthorizedDistanceIdentity(user, profile) {
  return Boolean(user?.id && profile?.id);
}

export function createCandidatePairs(origins, destinations) {
  return origins.slice(0, 2).flatMap((origin) =>
    destinations.slice(0, 2).map((destination) => [origin, destination])
  );
}

export function calculateEstimatedDistanceKm(origin, destination) {
  const [originLon, originLat] = origin;
  const [destinationLon, destinationLat] = destination;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLat = toRadians(destinationLat - originLat);
  const deltaLon = toRadians(destinationLon - originLon);
  const a = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(originLat)) * Math.cos(toRadians(destinationLat)) * Math.sin(deltaLon / 2) ** 2;
  const straightLineKm = 2 * 6371 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(Math.max(straightLineKm * 1.35, straightLineKm + 1) * 100) / 100;
}

export async function fetchJsonWithTimeout(url, init = {}, options = {}) {
  const fetchFn = options.fetchFn || fetch;
  const timeoutMs = options.timeoutMs || DISTANCE_EXTERNAL_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(url, { ...init, signal: controller.signal });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type')?.toLowerCase() || '';
    if (!contentType.includes('application/json') && !contentType.includes('+json')) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
