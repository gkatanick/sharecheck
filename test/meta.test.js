import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMeta, resolveUrl, decodeEntities } from '../src/meta.js';

const BASE = 'https://acme.example/widgets';
const perfect = await readFile(new URL('./fixtures/perfect.html', import.meta.url), 'utf8');
const sparse = await readFile(new URL('./fixtures/sparse.html', import.meta.url), 'utf8');

test('parses a fully-tagged page', () => {
  const m = parseMeta(perfect, BASE);
  assert.equal(m.title, 'Acme Widgets — Widgets That Work');
  assert.equal(m.metaDescription, 'Acme builds reliable widgets for modern teams. Try the widget configurator free — no signup required.');
  assert.equal(m.canonical, 'https://acme.example/widgets');
  assert.equal(m.favicon, 'https://acme.example/favicon.svg');
  assert.equal(m.og.title, 'Acme Widgets');
  assert.equal(m.og.image, 'https://acme.example/og.png');
  assert.equal(m.og.site_name, 'Acme');
  assert.equal(m.twitter.card, 'summary_large_image');
  assert.equal(m.twitter.title, 'Acme Widgets on X');
});

test('sparse page yields nulls and empty maps', () => {
  const m = parseMeta(sparse, BASE);
  assert.equal(m.title, 'Just a title & nothing else');
  assert.equal(m.metaDescription, null);
  assert.equal(m.canonical, null);
  assert.equal(m.favicon, null);
  assert.deepEqual(m.og, {});
  assert.deepEqual(m.twitter, {});
});

test('ignores meta-looking tags after <body>', () => {
  const m = parseMeta(perfect, BASE);
  assert.equal(m.og.body, undefined);
});

test('first occurrence wins on duplicates', () => {
  const html = '<head><meta property="og:title" content="First"><meta property="og:title" content="Second"></head>';
  assert.equal(parseMeta(html, BASE).og.title, 'First');
});

test('handles single-quoted and unquoted attributes', () => {
  const html = "<head><meta property='og:title' content='Quoted'><meta name=twitter:card content=summary></head>";
  const m = parseMeta(html, BASE);
  assert.equal(m.og.title, 'Quoted');
  assert.equal(m.twitter.card, 'summary');
});

test('decodes entities in content', () => {
  const html = '<head><meta property="og:title" content="Fish &amp; Chips &#8212; &#x2713;"></head>';
  assert.equal(parseMeta(html, BASE).og.title, 'Fish & Chips — ✓');
});

test('resolveUrl resolves relative against base and rejects garbage', () => {
  assert.equal(resolveUrl('/og.png', BASE), 'https://acme.example/og.png');
  assert.equal(resolveUrl('https://cdn.example/x.png', BASE), 'https://cdn.example/x.png');
  assert.equal(resolveUrl(null, BASE), null);
});

test('decodeEntities passes through unknown entities', () => {
  assert.equal(decodeEntities('&notarealentity; ok'), '&notarealentity; ok');
});

test('whitespace in title collapses', () => {
  assert.equal(parseMeta('<head><title>  Two\n  Lines  </title></head>', BASE).title, 'Two Lines');
});
