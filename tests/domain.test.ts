import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { OHTTPSClient } from '../app/domain/ohttps-client';
import { isWithinRenewalWindow, validateCertificatePair } from '../app/domain/certificate';

async function run() {
  assert.equal(OHTTPSClient.sign('demo-id', 'demo-key', 'cert-1', 1700000000000), 'b018929911c37d8ecfefd706d87d29cc');

  let calledUrl = '';
  const client = new OHTTPSClient('id', 'secret', {
    now: () => 123,
    fetchImpl: async (input) => {
      calledUrl = String(input);
      return new Response(JSON.stringify({ success: true, payload: { certKey: 'key', fullChainCerts: 'cert', expiredTime: '2030-01-01' } }));
    },
  });
  const result = await client.getCertificate('c');
  assert.equal(result.expiredTime, '2030-01-01');
  assert.equal(new URL(calledUrl).searchParams.get('apiId'), 'id');
  assert.equal(new URL(calledUrl).searchParams.get('timestamp'), '123');

  const errorClient = new OHTTPSClient('id', 'super-secret', {
    fetchImpl: async () => new Response(JSON.stringify({ success: false, msg: 'bad super-secret' })),
  });
  await assert.rejects(() => errorClient.getCertificate('c'), (error: Error & { code?: string }) => error.code === 'API_ERROR' && !error.message.includes('super-secret'));

  assert.throws(() => validateCertificatePair('not pem', 'not key'), /invalid certificate PEM/);
  const cert = await readFile(new URL('./fixtures/test-cert.pem', import.meta.url), 'utf8');
  const key = await readFile(new URL('./fixtures/test-key.pem', import.meta.url), 'utf8');
  const parsed = validateCertificatePair(cert, key, { checkValidity: false });
  assert.match(parsed.fingerprint, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
  assert.throws(() => validateCertificatePair(cert, key, { requiredSans: ['missing.example'], checkValidity: false }), /SAN/);

  const now = new Date('2026-08-30T00:00:00Z');
  assert.equal(isWithinRenewalWindow(new Date('2026-09-10T00:00:00Z'), now), true);
  assert.equal(isWithinRenewalWindow(new Date('2026-10-01T00:00:00Z'), now), false);
  console.log('domain tests passed');
}

run();
