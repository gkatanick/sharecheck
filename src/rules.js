// ShareCheck audit rules — the 19 checks from the design spec.
// Pure module: no DOM, no Node APIs.

const SEVERITY_ORDER = { error: 0, warn: 1, info: 2 };

function normalizeUrl(u) {
  try {
    const x = new URL(u);
    return x.origin.toLowerCase() + x.pathname.replace(/\/+$/, '') + x.search;
  } catch {
    return u;
  }
}

export function runRules(meta, imageInfo = null) {
  const findings = [];
  const add = (id, severity, message, fixSnippet = null) =>
    findings.push({ id, severity, message, fixSnippet });

  const { og, twitter: tw } = meta;
  const titleSuggestion = meta.title || 'Your page title';
  const descSuggestion = meta.metaDescription || 'A one-sentence summary of this page.';
  const urlSuggestion = meta.canonical || 'https://example.com/this-page';

  if (!meta.title) {
    add('missing-title', 'error',
      'The page has no <title>. Search results and every social platform fall back to it.',
      '<title>Your page title</title>');
  } else if (meta.title.length > 60) {
    add('title-too-long', 'warn',
      `The title is ${meta.title.length} characters — Google truncates titles around 60.`);
  }

  if (!meta.metaDescription) {
    add('missing-description', 'error',
      'No meta description — Google will improvise a snippet from page text.',
      `<meta name="description" content="${descSuggestion}">`);
  } else if (meta.metaDescription.length < 70 || meta.metaDescription.length > 160) {
    add('description-length', 'warn',
      `The meta description is ${meta.metaDescription.length} characters — aim for 70–160.`);
  }

  if (!og.title) {
    add('missing-og-title', 'warn',
      'No og:title — social cards fall back to the page <title>.',
      `<meta property="og:title" content="${titleSuggestion}">`);
  }
  if (!og.description) {
    add('missing-og-description', 'warn',
      'No og:description — social cards fall back to the meta description, or show nothing.',
      `<meta property="og:description" content="${descSuggestion}">`);
  }

  if (!og.image) {
    add('missing-og-image', 'error',
      'No og:image — the link renders without a picture on every social platform.',
      '<meta property="og:image" content="https://example.com/preview.png">');
  } else {
    if (!/^https?:\/\//i.test(og.image)) {
      add('og-image-relative', 'error',
        'og:image is a relative URL — social crawlers require an absolute URL.',
        `<meta property="og:image" content="https://example.com${og.image.startsWith('/') ? '' : '/'}${og.image}">`);
    } else if (/^http:\/\//i.test(og.image)) {
      add('og-image-insecure', 'warn',
        'og:image is served over http:// — some platforms refuse non-HTTPS images.');
    }
    if (imageInfo && imageInfo.loaded === false) {
      add('og-image-unloadable', 'error', 'The og:image URL failed to load.');
    }
    if (imageInfo && imageInfo.loaded === true) {
      const { width, height } = imageInfo;
      if (width < 200 || height < 200) {
        add('og-image-too-small', 'error',
          `og:image is ${width}×${height} — below the 200×200 minimum most platforms enforce.`);
      } else if (width < 1200 || height < 630) {
        add('og-image-small', 'warn',
          `og:image is ${width}×${height} — 1200×630 is the recommended size for large cards.`);
      }
    }
  }

  if (!og.url) {
    add('missing-og-url', 'warn',
      'No og:url — helps platforms consolidate shares of the same page.',
      `<meta property="og:url" content="${urlSuggestion}">`);
  }
  if (!og.type) {
    add('missing-og-type', 'info',
      'No og:type — "website" is the sensible default.',
      '<meta property="og:type" content="website">');
  }
  if (!og.site_name) {
    add('missing-og-site-name', 'info',
      'No og:site_name — some platforms show the site name above the card title.',
      '<meta property="og:site_name" content="Your Site">');
  }

  if (!tw.card) {
    add('missing-twitter-card', 'warn',
      'No twitter:card — X decides the card format for you (usually the small one).',
      '<meta name="twitter:card" content="summary_large_image">');
  } else if (tw.card !== 'summary_large_image') {
    add('twitter-card-small', 'info',
      `twitter:card is "${tw.card}" — summary_large_image gets the full-width image treatment.`);
  }

  if (!meta.canonical) {
    add('missing-canonical', 'warn',
      'No canonical link — helps Google consolidate duplicate URLs.',
      `<link rel="canonical" href="${urlSuggestion}">`);
  } else if (og.url && normalizeUrl(meta.canonical) !== normalizeUrl(og.url)) {
    add('canonical-og-mismatch', 'info',
      'The canonical URL and og:url disagree — pick one address for the page.');
  }

  if (!meta.favicon) {
    add('missing-favicon', 'info',
      'No favicon link found (browsers fall back to /favicon.ico, but declare one explicitly).',
      '<link rel="icon" href="/favicon.ico">');
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
