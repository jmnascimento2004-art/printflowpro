import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PdfFetchError,
  fetchAuthenticatedPdf,
  getPdfFilename
} from '../src/lib/pdf/pdf-authenticated-fetch.mjs';

const origin = 'http://localhost:3000';
const token = 'opaque-secret-token';

function pdfResponse(status = 200, headers = {}) {
  return new Response(new Blob(['%PDF-test'], { type: 'application/pdf' }), {
    status,
    headers: { 'Content-Type': 'application/pdf', ...headers }
  });
}

test('adds Bearer in memory and keeps the token out of the URL', async () => {
  let requestUrl = '';
  let authorization = '';
  const result = await fetchAuthenticatedPdf('/api/pdf/quote/1', {
    origin,
    getAccessToken: async () => token,
    fetchImpl: async (url, init) => {
      requestUrl = String(url);
      authorization = new Headers(init.headers).get('authorization') || '';
      assert.equal(init.credentials, 'include');
      assert.equal(init.redirect, 'error');
      return pdfResponse();
    }
  });

  assert.equal(authorization, `Bearer ${token}`);
  assert.equal(requestUrl, `${origin}/api/pdf/quote/1`);
  assert.ok(!requestUrl.includes(token));
  assert.ok(result.blob instanceof Blob);
});

test('blocks a missing session before fetch', async () => {
  let fetched = false;
  await assert.rejects(
    fetchAuthenticatedPdf('/api/pdf/order/1', {
      origin,
      getAccessToken: async () => null,
      fetchImpl: async () => {
        fetched = true;
        return pdfResponse();
      }
    }),
    (error) => error instanceof PdfFetchError && error.status === 401
  );
  assert.equal(fetched, false);
});

test('never forwards the token to another origin', async () => {
  let fetched = false;
  await assert.rejects(
    fetchAuthenticatedPdf('https://example.com/document.pdf', {
      origin,
      getAccessToken: async () => token,
      fetchImpl: async () => {
        fetched = true;
        return pdfResponse();
      }
    }),
    (error) => error instanceof PdfFetchError
      && error.status === 400
      && !error.message.includes(token)
  );
  assert.equal(fetched, false);
});

for (const status of [401, 403, 404]) {
  test(`returns a sanitized ${status} error`, async () => {
    await assert.rejects(
      fetchAuthenticatedPdf('/api/pdf/receipt/1', {
        origin,
        getAccessToken: async () => token,
        fetchImpl: async () => pdfResponse(status)
      }),
      (error) => error instanceof PdfFetchError
        && error.status === status
        && !error.message.includes(token)
    );
  });
}

test('rejects a non-PDF response', async () => {
  await assert.rejects(
    fetchAuthenticatedPdf('/api/pdf/quote/1', {
      origin,
      getAccessToken: async () => token,
      fetchImpl: async () => new Response('<html></html>', {
        headers: { 'Content-Type': 'text/html' }
      })
    }),
    (error) => error instanceof PdfFetchError && error.status === 502
  );
});

test('returns a PDF Blob and a sanitized Content-Disposition filename', async () => {
  const result = await fetchAuthenticatedPdf('/api/pdf/quote/1?download=1', {
    origin,
    getAccessToken: async () => token,
    fallbackFilename: 'fallback.pdf',
    fetchImpl: async () => pdfResponse(200, {
      'Content-Disposition': "attachment; filename*=UTF-8''ORC-1011.pdf"
    })
  });

  assert.equal(result.blob.type, 'application/pdf');
  assert.equal(await result.blob.text(), '%PDF-test');
  assert.equal(result.filename, 'ORC-1011.pdf');
  assert.equal(getPdfFilename('attachment; filename="../unsafe.pdf"'), 'unsafe.pdf');
});

test('sanitizes network failures without leaking the token', async () => {
  await assert.rejects(
    fetchAuthenticatedPdf('/api/pdf/quote/1', {
      origin,
      getAccessToken: async () => token,
      fetchImpl: async () => { throw new Error(token); }
    }),
    (error) => error instanceof PdfFetchError
      && error.status === 0
      && !error.message.includes(token)
  );
});
