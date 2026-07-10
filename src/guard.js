// SSRF protection for the public fetch proxy. Pure module so the ranges are
// unit-testable without network access.

function parseIpv4(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((p) => p <= 255) ? parts : null;
}

export function isPrivateIp(ip) {
  const bare = ip.replace(/^\[|\]$/g, '').toLowerCase();
  const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (!mapped) {
    const hexMapped = bare.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16);
      const lo = parseInt(hexMapped[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
  }
  const v4 = parseIpv4(mapped ? mapped[1] : bare);
  if (v4) {
    const [a, b, c] = v4;
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224 ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && b === 0 && c === 0)
    );
  }
  if (bare.includes(':')) {
    return (
      bare === '::' || bare === '::1' ||
      bare.startsWith('fc') || bare.startsWith('fd') ||
      /^fe[89ab]/.test(bare) ||
      bare.startsWith('ff') ||
      bare.startsWith('2002:')
    );
  }
  return false;
}

export function validateTargetUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid-url' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'bad-scheme' };
  }
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' || host.endsWith('.localhost') ||
    host.endsWith('.local') || host.endsWith('.internal') ||
    isPrivateIp(host)
  ) {
    return { ok: false, reason: 'blocked-host' };
  }
  return { ok: true, url };
}
