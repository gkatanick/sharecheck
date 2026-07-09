import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runRules } from '../src/rules.js';

const EMPTY = { title: null, metaDescription: null, canonical: null, favicon: null, og: {}, twitter: {} };
const PERFECT = {
  title: 'Acme Widgets',
  metaDescription: 'Acme builds reliable widgets for modern teams. Try the configurator free today.',
  canonical: 'https://acme.example/widgets',
  favicon: 'https://acme.example/favicon.svg',
  og: {
    title: 'Acme Widgets', description: 'Reliable widgets.', image: 'https://acme.example/og.png',
    url: 'https://acme.example/widgets', type: 'website', site_name: 'Acme',
  },
  twitter: { card: 'summary_large_image' },
};
const ids = (findings) => findings.map((f) => f.id);

test('perfect page with a good image yields no findings', () => {
  assert.deepEqual(runRules(PERFECT, { loaded: true, width: 1200, height: 630 }), []);
});

test('empty page fires all the missing-tag rules', () => {
  const got = ids(runRules(EMPTY, null));
  for (const id of ['missing-title', 'missing-description', 'missing-og-title', 'missing-og-description',
    'missing-og-image', 'missing-og-url', 'missing-og-type', 'missing-og-site-name',
    'missing-twitter-card', 'missing-canonical', 'missing-favicon']) {
    assert.ok(got.includes(id), `expected ${id}`);
  }
});

test('findings are sorted errors first, then warns, then infos', () => {
  const sev = runRules(EMPTY, null).map((f) => f.severity);
  const order = { error: 0, warn: 1, info: 2 };
  const sorted = [...sev].sort((a, b) => order[a] - order[b]);
  assert.deepEqual(sev, sorted);
});

test('long title and bad description lengths warn', () => {
  const m = { ...PERFECT, title: 'x'.repeat(61), metaDescription: 'too short' };
  const got = ids(runRules(m, { loaded: true, width: 1200, height: 630 }));
  assert.ok(got.includes('title-too-long'));
  assert.ok(got.includes('description-length'));
});

test('relative og:image is an error; http image warns', () => {
  const rel = { ...PERFECT, og: { ...PERFECT.og, image: '/og.png' } };
  assert.ok(ids(runRules(rel, null)).includes('og-image-relative'));
  const insecure = { ...PERFECT, og: { ...PERFECT.og, image: 'http://acme.example/og.png' } };
  assert.ok(ids(runRules(insecure, null)).includes('og-image-insecure'));
});

test('image size rules: tiny is error, mid-size is warn, unloadable is error', () => {
  assert.ok(ids(runRules(PERFECT, { loaded: true, width: 150, height: 150 })).includes('og-image-too-small'));
  assert.ok(ids(runRules(PERFECT, { loaded: true, width: 800, height: 400 })).includes('og-image-small'));
  assert.ok(ids(runRules(PERFECT, { loaded: false, width: 0, height: 0 })).includes('og-image-unloadable'));
});

test('non-large twitter card is info', () => {
  const m = { ...PERFECT, twitter: { card: 'summary' } };
  assert.ok(ids(runRules(m, { loaded: true, width: 1200, height: 630 })).includes('twitter-card-small'));
});

test('canonical vs og:url mismatch is info; trailing slash is not a mismatch', () => {
  const mismatch = { ...PERFECT, og: { ...PERFECT.og, url: 'https://other.example/page' } };
  assert.ok(ids(runRules(mismatch, { loaded: true, width: 1200, height: 630 })).includes('canonical-og-mismatch'));
  const slash = { ...PERFECT, og: { ...PERFECT.og, url: 'https://acme.example/widgets/' } };
  assert.ok(!ids(runRules(slash, { loaded: true, width: 1200, height: 630 })).includes('canonical-og-mismatch'));
});

test('fix snippets pre-fill from existing page values', () => {
  const m = { ...EMPTY, title: 'My Great Page' };
  const f = runRules(m, null).find((x) => x.id === 'missing-og-title');
  assert.ok(f.fixSnippet.includes('My Great Page'));
});
