import { test } from 'node:test';
import assert from 'node:assert/strict';
import { effectiveFor, PLATFORMS } from '../src/previews.js';

const URL_ = 'https://www.acme.example/widgets';
const FULL = {
  title: 'HTML Title', metaDescription: 'HTML description here.',
  canonical: 'https://acme.example/widgets', favicon: 'https://acme.example/fav.svg',
  og: { title: 'OG Title', description: 'OG description.', image: '/og.png', site_name: 'Acme' },
  twitter: { card: 'summary_large_image', title: 'TW Title', description: 'TW description.', image: 'https://cdn.example/tw.png' },
};
const BARE = { title: 'HTML Title', metaDescription: null, canonical: null, favicon: null, og: {}, twitter: {} };

test('exports the five platforms in display order', () => {
  assert.deepEqual(PLATFORMS, ['google', 'x', 'facebook', 'linkedin', 'slack']);
});

test('x prefers twitter:* over og:* over html', () => {
  const e = effectiveFor('x', FULL, URL_);
  assert.equal(e.title, 'TW Title');
  assert.equal(e.image, 'https://cdn.example/tw.png');
  assert.equal(e.large, true);
});

test('facebook and linkedin prefer og:* and resolve relative image URLs', () => {
  for (const p of ['facebook', 'linkedin']) {
    const e = effectiveFor(p, FULL, URL_);
    assert.equal(e.title, 'OG Title');
    assert.equal(e.image, 'https://www.acme.example/og.png');
  }
});

test('google uses html title/description and strips www from domain', () => {
  const e = effectiveFor('google', FULL, URL_);
  assert.equal(e.title, 'HTML Title');
  assert.equal(e.description, 'HTML description here.');
  assert.equal(e.domain, 'acme.example');
});

test('slack uses og with site_name and falls through to twitter then html', () => {
  const e = effectiveFor('slack', FULL, URL_);
  assert.equal(e.siteName, 'Acme');
  assert.equal(e.title, 'OG Title');
});

test('bare page falls back to html title everywhere, no image', () => {
  for (const p of PLATFORMS) {
    const e = effectiveFor(p, BARE, URL_);
    assert.equal(e.title, 'HTML Title', p);
    if (p !== 'google') assert.equal(e.image ?? null, null, p);
  }
});

test('x without twitter:card but with og:image defaults to large card', () => {
  const m = { ...BARE, og: { image: 'https://acme.example/og.png' } };
  assert.equal(effectiveFor('x', m, URL_).large, true);
});

test('explicit twitter:card=summary stays small even with an image', () => {
  const m = { ...BARE, og: { image: 'https://acme.example/og.png' }, twitter: { card: 'summary' } };
  assert.equal(effectiveFor('x', m, URL_).large, false);
});
