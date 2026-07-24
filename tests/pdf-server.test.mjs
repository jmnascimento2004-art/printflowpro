import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { Document, Page, Text, renderToBuffer } from '@react-pdf/renderer';
import { PdfAccessError, getPdfBearerToken, requireActivePdfProfile } from '../src/lib/pdf/pdf-access.mjs';
import { createPdfResponseHeaders } from '../src/lib/pdf/pdf-http.mjs';

function createAccessClient({ user = { id: 'user-1' }, authError = null, profile = null } = {}) {
  const filters = [];
  const getUserTokens = [];
  const query = {
    select() {
      return this;
    },
    eq(column, value) {
      filters.push([column, value]);
      return this;
    },
    async maybeSingle() {
      return { data: profile, error: null };
    }
  };

  return {
    filters,
    client: {
      auth: { getUser: async (token) => {
        getUserTokens.push(token);
        return { data: { user }, error: authError };
      } },
      from: (table) => {
        assert.equal(table, 'profiles');
        return query;
      }
    },
    getUserTokens
  };
}

test('renders a real PDF entirely in the Node.js runtime', async () => {
  assert.equal(typeof window, 'undefined');

  const document = React.createElement(
    Document,
    null,
    React.createElement(Page, null, React.createElement(Text, null, 'PrintFlowPRO'))
  );
  const buffer = await renderToBuffer(document);

  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buffer.length > 100);
});

test('uses private, non-sniffable inline PDF headers by default', () => {
  const headers = createPdfResponseHeaders('orcamento.pdf');

  assert.equal(headers['Content-Type'], 'application/pdf');
  assert.equal(headers['Content-Disposition'], 'inline; filename="orcamento.pdf"');
  assert.equal(headers['Cache-Control'], 'private, no-store');
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
});

test('uses attachment disposition and sanitizes unsafe filenames', () => {
  const headers = createPdfResponseHeaders('pedido"\r\n.pdf', true);

  assert.equal(headers['Content-Disposition'], 'attachment; filename="pedido___.pdf"');
});

test('rejects PDF generation without an authenticated session', async () => {
  const { client } = createAccessClient({ user: null });

  await assert.rejects(
    requireActivePdfProfile(client),
    (error) => error instanceof PdfAccessError && error.status === 401
  );
});

test('accepts a missing Authorization header for the secure cookie fallback', () => {
  assert.equal(getPdfBearerToken(new Request('http://localhost/api/pdf/quote/1')), null);
});

test('rejects a malformed Authorization header', () => {
  const request = new Request('http://localhost/api/pdf/quote/1', {
    headers: { Authorization: 'Basic credentials' }
  });

  assert.throws(
    () => getPdfBearerToken(request),
    (error) => error instanceof PdfAccessError && error.status === 401
  );
});

test('validates a Bearer access token with getUser(token)', async () => {
  const request = new Request('http://localhost/api/pdf/quote/1', {
    headers: { Authorization: 'Bearer opaque-token' }
  });
  const token = getPdfBearerToken(request);
  const { client, getUserTokens } = createAccessClient({
    profile: { id: 'profile-1', company_id: 'company-1', role: 'admin' }
  });

  await requireActivePdfProfile(client, token);
  assert.deepEqual(getUserTokens, ['opaque-token']);
});

test('rejects an invalid Bearer token without exposing it', async () => {
  const token = 'invalid-secret-token';
  const { client } = createAccessClient({ user: null, authError: new Error('invalid') });

  await assert.rejects(
    requireActivePdfProfile(client, token),
    (error) => error instanceof PdfAccessError
      && error.status === 401
      && !error.message.includes(token)
  );
});

test('rejects PDF generation without an active company profile', async () => {
  const { client } = createAccessClient();

  await assert.rejects(
    requireActivePdfProfile(client),
    (error) => error instanceof PdfAccessError && error.status === 403
  );
});

test('derives PDF company access from the authenticated active profile', async () => {
  const { client, filters } = createAccessClient({
    profile: { id: 'profile-1', company_id: 'company-1', role: 'admin' }
  });

  const access = await requireActivePdfProfile(client);

  assert.deepEqual(access, {
    userId: 'user-1',
    profileId: 'profile-1',
    companyId: 'company-1',
    role: 'admin'
  });
  assert.deepEqual(filters, [['auth_user_id', 'user-1'], ['active', true]]);
});
