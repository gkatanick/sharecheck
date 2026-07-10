import { lookup } from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
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

      // Resolve DNS exactly once, validate every returned address, then pin
      // the outgoing connection to that checked address (via a custom
      // `lookup` passed to http(s).request). This closes the DNS-rebinding
      // TOCTOU window: the socket can never dial an address that wasn't
      // checked, because it never re-resolves the hostname.
      let addrs;
      try {
        addrs = await lookup(url.hostname, { all: true });
      } catch {
        return send(502, { error: 'unreachable' });
      }
      if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) {
        return send(400, { error: 'blocked-host' });
      }

      const response = await issueRequest(url, addrs[0], deadline);

      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const location = response.headers.location;
        response.resume();
        if (!location) return send(502, { error: 'bad-redirect' });
        current = new URL(location, url).href;
        continue;
      }

      const type = (response.headers['content-type'] || '').toLowerCase();
      if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) {
        response.resume();
        return send(415, { error: 'not-html' });
      }

      const html = await readCapped(response, MAX_BYTES);
      return send(200, { finalUrl: url.href, status: response.statusCode, html });
    }
    return send(502, { error: 'too-many-redirects' });
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return send(502, { error: timedOut ? 'timeout' : 'unreachable' });
  }
}

function issueRequest(url, pinned, deadline) {
  const transport = url.protocol === 'https:' ? https : http;
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: 'GET',
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    signal: deadline,
    lookup(host, opts, cb) {
      // Pin: never re-resolve, always hand back the pre-checked address.
      if (opts && opts.all) cb(null, [pinned]);
      else cb(null, pinned.address, pinned.family);
    },
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (response) => resolve(response));
    req.on('error', reject);
    req.end();
  });
}

async function readCapped(stream, maxBytes) {
  const chunks = [];
  let total = 0;
  try {
    for await (const chunk of stream) {
      const remaining = maxBytes - total;
      const slice = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk;
      chunks.push(slice);
      total += slice.byteLength;
      if (total >= maxBytes) {
        stream.destroy();
        break;
      }
    }
  } catch (err) {
    if (chunks.length === 0) throw err;
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks, total));
}
