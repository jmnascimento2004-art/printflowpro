import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_IMAGE_BYTES,
  decodeImageDataUrl,
  fetchValidatedRemoteImage,
  parseAllowedImageHosts,
  validateRemoteImageUrl
} from '../src/lib/security/remote-image.mjs';

const allowedHosts = parseAllowedImageHosts('cdn.example.com');
const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('rejects localhost, private IPv4, local IPv6 and metadata endpoints', async () => {
  assert.equal(await validateRemoteImageUrl('https://localhost/icon.png', { allowedHosts, lookupFn: publicLookup }), null);
  assert.equal(await validateRemoteImageUrl('https://192.168.1.2/icon.png', { allowedHosts: new Set(['192.168.1.2']), lookupFn: publicLookup }), null);
  assert.equal(await validateRemoteImageUrl('https://[::1]/icon.png', { allowedHosts: new Set(['[::1]']), lookupFn: publicLookup }), null);
  assert.equal(await validateRemoteImageUrl('https://169.254.169.254/latest/meta-data', { allowedHosts: new Set(['169.254.169.254']), lookupFn: publicLookup }), null);
  assert.equal(await validateRemoteImageUrl('https://metadata.google.internal/computeMetadata/v1', {
    allowedHosts: new Set(['metadata.google.internal']),
    lookupFn: async () => [{ address: '169.254.169.254', family: 4 }]
  }), null);
});

test('rejects credentials and non-HTTPS/default ports', async () => {
  assert.equal(await validateRemoteImageUrl('https://user:pass@cdn.example.com/icon.png', { allowedHosts, lookupFn: publicLookup }), null);
  assert.equal(await validateRemoteImageUrl('https://cdn.example.com:8443/icon.png', { allowedHosts, lookupFn: publicLookup }), null);
  assert.equal(await validateRemoteImageUrl('http://cdn.example.com/icon.png', { allowedHosts, lookupFn: publicLookup }), null);
});

test('rejects redirects, non-images and oversized remote responses', async () => {
  const redirect = await fetchValidatedRemoteImage('https://cdn.example.com/icon.png', {
    allowedHosts,
    lookupFn: publicLookup,
    fetchFn: async () => new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/' } })
  });
  assert.equal(redirect, null);

  const text = await fetchValidatedRemoteImage('https://cdn.example.com/icon.png', {
    allowedHosts,
    lookupFn: publicLookup,
    fetchFn: async () => new Response('not an image', { headers: { 'content-type': 'text/plain' } })
  });
  assert.equal(text, null);

  const oversized = await fetchValidatedRemoteImage('https://cdn.example.com/icon.png', {
    allowedHosts,
    lookupFn: publicLookup,
    fetchFn: async () => new Response(new Uint8Array(MAX_IMAGE_BYTES + 1), { headers: { 'content-type': 'image/png' } })
  });
  assert.equal(oversized, null);
});

test('rejects oversized data URLs and accepts valid allowed images', async () => {
  const oversizedData = `data:image/png;base64,${Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64')}`;
  assert.equal(decodeImageDataUrl(oversizedData), null);

  const validBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const image = await fetchValidatedRemoteImage('https://cdn.example.com/icon.png', {
    allowedHosts,
    lookupFn: publicLookup,
    fetchFn: async () => new Response(validBytes, { headers: { 'content-type': 'image/png' } })
  });
  assert.deepEqual(image, validBytes);
});
