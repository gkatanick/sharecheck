import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTargetUrl, isPrivateIp } from '../src/guard.js';

test('accepts normal https and http URLs', () => {
  assert.equal(validateTargetUrl('https://example.com/page').ok, true);
  assert.equal(validateTargetUrl('http://example.com').ok, true);
});

test('rejects non-http schemes and garbage', () => {
  assert.deepEqual(validateTargetUrl('ftp://example.com'), { ok: false, reason: 'bad-scheme' });
  assert.deepEqual(validateTargetUrl('file:///etc/passwd'), { ok: false, reason: 'bad-scheme' });
  assert.deepEqual(validateTargetUrl('not a url'), { ok: false, reason: 'invalid-url' });
});

test('rejects localhost and internal hostnames', () => {
  for (const u of ['http://localhost:3000', 'https://foo.localhost', 'http://db.internal', 'http://printer.local']) {
    assert.deepEqual(validateTargetUrl(u), { ok: false, reason: 'blocked-host' }, u);
  }
});

test('rejects private IP literals in URLs', () => {
  for (const u of ['http://127.0.0.1', 'http://10.1.2.3', 'http://172.16.0.1', 'http://192.168.1.1',
    'http://169.254.169.254/latest/meta-data', 'http://[::1]:8080', 'http://0.0.0.0']) {
    assert.deepEqual(validateTargetUrl(u), { ok: false, reason: 'blocked-host' }, u);
  }
});

test('isPrivateIp covers v4 ranges, v6 locals, and mapped v4', () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254',
    '100.64.0.1', '0.0.0.0', '::1', 'fc00::1', 'fd12::1', 'fe80::1', '::ffff:127.0.0.1']) {
    assert.equal(isPrivateIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '93.184.216.34', '2606:2800:220:1::1']) {
    assert.equal(isPrivateIp(ip), false, ip);
  }
});
