// ShareCheck meta parser. Dependency-free and DOM-free so the identical module
// runs in the browser and under node:test.

const NAMED_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text) {
  return text.replace(/&(#[xX]?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body[0] === '#') {
      const code = /^#[xX]/.test(body) ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

export function resolveUrl(value, baseUrl) {
  if (!value) return null;
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return null;
  }
}

function parseAttributes(tag) {
  const attrs = {};
  const body = tag.replace(/^<\s*[a-zA-Z][\w-]*/, '').replace(/\/?>?$/, '');
  const attrRe = /([a-zA-Z][\w:-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = attrRe.exec(body)) !== null) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

export function parseMeta(html, baseUrl) {
  // Everything we need lives before <body>; cutting there keeps scanning cheap
  // and stops meta-shaped text in page content from polluting results.
  const bodyIdx = html.search(/<body[\s>]/i);
  const head = bodyIdx === -1 ? html : html.slice(0, bodyIdx);

  const meta = {
    title: null,
    metaDescription: null,
    canonical: null,
    favicon: null,
    og: {},
    twitter: {},
  };

  const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    meta.title = decodeEntities(titleMatch[1]).replace(/\s+/g, ' ').trim() || null;
  }

  const tagRe = /<(meta|link)\b[^>]*>?/gi;
  let m;
  while ((m = tagRe.exec(head)) !== null) {
    const attrs = parseAttributes(m[0]);
    if (m[1].toLowerCase() === 'meta') {
      const key = (attrs.property || attrs.name || '').toLowerCase();
      const content = (attrs.content ?? '').trim();
      if (key === 'description') {
        if (meta.metaDescription === null) meta.metaDescription = content || null;
      } else if (key.startsWith('og:')) {
        const prop = key.slice(3);
        if (!(prop in meta.og)) meta.og[prop] = content;
      } else if (key.startsWith('twitter:')) {
        const prop = key.slice(8);
        if (!(prop in meta.twitter)) meta.twitter[prop] = content;
      }
    } else {
      const rels = (attrs.rel || '').toLowerCase().split(/\s+/);
      if (rels.includes('canonical') && meta.canonical === null) {
        meta.canonical = resolveUrl(attrs.href, baseUrl);
      }
      if (rels.some((r) => r.includes('icon')) && meta.favicon === null) {
        meta.favicon = resolveUrl(attrs.href, baseUrl);
      }
    }
  }
  return meta;
}
