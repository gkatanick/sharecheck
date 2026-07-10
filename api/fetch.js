import { lookup } from 'node:dns/promises';
import { validateTargetUrl, isPrivateIp } from '../src/guard.js';

const MAX_REDIRECTS = 5;
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 8000;
const USER_AGENT = 'ShareCheckBot/1.0 (+https://sharecheck.vercel.app)';

export default async function handler(req, res) {
  const send = (status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };

  const target = new URL(req.url, 'http://localhost').searchParams.get('url');
  if (!target) return send(400, { error: 'missing-url' });

  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  let current = target;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const check = validateTargetUrl(current);
      if (!check.ok) return send(400, { error: check.reason });
      const { url } = check;

      // Refuse hostnames that resolve into private address space. (DNS is
      // re-resolved by fetch below — acceptable TOCTOU window for this tool.)
      try {
        const { address } = await lookup(url.hostname);
        if (isPrivateIp(address)) return send(400, { error: 'blocked-host' });
      } catch {
        return send(502, { error: 'unreachable' });
      }

      const response = await fetch(url, {
        redirect: 'manual',
        signal: deadline,
        headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) return send(502, { error: 'bad-redirect' });
        current = new URL(location, url).href;
        continue;
      }

      const type = (response.headers.get('content-type') || '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) {
        return send(415, { error: 'not-html' });
      }

      const html = await readCapped(response.body, MAX_BYTES);
      return send(200, { finalUrl: url.href, status: response.status, html });
    }
    return send(502, { error: 'too-many-redirects' });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return send(502, { error: timedOut ? 'timeout' : 'unreachable' });
  }
}

async function readCapped(stream, maxBytes) {
  if (!stream) return '';
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  reader.cancel().catch(() => {});
  const size = Math.min(total, maxBytes);
  const buf = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    const slice = chunk.subarray(0, Math.min(chunk.byteLength, size - offset));
    buf.set(slice, offset);
    offset += slice.byteLength;
    if (offset >= size) break;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buf);
}
