import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateEstimatedDistanceKm,
  createCandidatePairs,
  createDistanceCacheKey,
  fetchJsonWithTimeout,
  isAuthorizedDistanceIdentity,
  validateDistancePayload
} from '../src/lib/security/distance-request.mjs';

test('rejects unauthorized identities', () => {
  assert.equal(isAuthorizedDistanceIdentity(null, null), false);
  assert.equal(isAuthorizedDistanceIdentity({ id: 'user' }, null), false);
  assert.equal(isAuthorizedDistanceIdentity({ id: 'user' }, { id: 'profile' }), true);
});

test('rejects oversized addresses and invalid profiles', () => {
  assert.equal(validateDistancePayload({ origin: 'a'.repeat(301), destination: 'Rua valida 123', profile: 'driving-car' }), null);
  assert.equal(validateDistancePayload({ origin: 'Rua valida 123', destination: 'Outra rua 456', profile: 'foot-walking' }), null);
});

test('limits routing fan-out to four candidate pairs', () => {
  const pairs = createCandidatePairs([1, 2, 3, 4], ['a', 'b', 'c']);
  assert.equal(pairs.length, 4);
});

test('aborts timed out external calls', async () => {
  const result = await fetchJsonWithTimeout('https://example.test', {}, {
    timeoutMs: 5,
    fetchFn: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })
  });
  assert.equal(result, null);
});

test('cache hashes normalized equivalent addresses identically', () => {
  const first = createDistanceCacheKey(' Rua A, 10 ', 'Rua B, 20', 'driving-car');
  const second = createDistanceCacheKey('rua   a, 10', 'rua b, 20', 'driving-car');
  assert.equal(first, second);
});

test('returns a valid positive estimated route distance', () => {
  const distance = calculateEstimatedDistanceKm([-38.5014, -12.973], [-38.4767, -12.9904]);
  assert.ok(distance > 0);
  assert.ok(Number.isFinite(distance));
});
