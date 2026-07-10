import { parseMeta, resolveUrl } from './meta.js';
import { runRules } from './rules.js';
import { renderPreviews } from './previews.js';

const form = document.getElementById('check-form');
const input = document.getElementById('url-input');
const button = document.getElementById('check-button');
const statusEl = document.getElementById('status');
const results = document.getElementById('results');
const httpBanner = document.getElementById('http-banner');
const previewsEl = document.getElementById('previews');
const findingsEl = document.getElementById('findings');
const scoreEl = document.getElementById('audit-score');

const ERROR_MESSAGES = {
  'missing-url': 'Enter a URL to check.',
  'invalid-url': "That doesn't look like a valid URL.",
  'bad-scheme': 'Only http:// and https:// URLs can be checked.',
  'blocked-host': "That address can't be checked.",
  'not-html': "That URL isn't a web page.",
  timeout: "Couldn't reach that URL — it took too long to respond.",
  unreachable: "Couldn't reach that URL.",
  'bad-redirect': 'The site sent a broken redirect.',
  'too-many-redirects': 'The site redirected too many times.',
};

function setStatus(message, isError = false) {
  statusEl.hidden = !message;
  statusEl.textContent = message || '';
  statusEl.className = `status${isError ? ' error' : ''}`;
}

function loadImageInfo(src) {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve({ loaded: true, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ loaded: false, width: 0, height: 0 });
    img.src = src;
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function renderFindings(findings) {
  const counts = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  scoreEl.textContent = findings.length
    ? `— ${counts.error} errors · ${counts.warn} warnings · ${counts.info} suggestions`
    : '';

  if (!findings.length) {
    findingsEl.innerHTML = '<li class="all-clear">✅ All checks passed — this page is ready to share.</li>';
    return;
  }
  findingsEl.innerHTML = findings.map((f) => `
    <li class="finding ${f.severity}">
      ${f.fixSnippet ? '<button class="copy-btn" type="button">Copy fix</button>' : ''}
      <span class="sev">${f.severity}</span>${esc(f.message)}
      ${f.fixSnippet ? `<pre><code>${esc(f.fixSnippet)}</code></pre>` : ''}
    </li>`).join('');

  for (const li of findingsEl.querySelectorAll('.finding')) {
    const btn = li.querySelector('.copy-btn');
    if (!btn) continue;
    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(li.querySelector('code').textContent);
      btn.textContent = 'Copied!';
      setTimeout(() => (btn.textContent = 'Copy fix'), 1500);
    });
  }
}

async function check(rawUrl) {
  button.disabled = true;
  results.hidden = true;
  setStatus('Fetching page…');
  try {
    const resp = await fetch(`/api/fetch?url=${encodeURIComponent(rawUrl)}`);
    const data = await resp.json();
    if (data.error) {
      setStatus(ERROR_MESSAGES[data.error] || 'Something went wrong.', true);
      return;
    }

    const meta = parseMeta(data.html, data.finalUrl);
    setStatus('Checking image…');
    const imageSrc = resolveUrl(meta.og.image || null, data.finalUrl);
    const imageInfo = imageSrc && /^https?:\/\//i.test(imageSrc) ? await loadImageInfo(imageSrc) : null;

    renderPreviews(previewsEl, meta, data.finalUrl);
    renderFindings(runRules(meta, imageInfo));

    httpBanner.hidden = data.status < 400;
    if (data.status >= 400) {
      httpBanner.textContent = `⚠️ The page returned HTTP ${data.status} — previews below come from its error page.`;
    }

    setStatus('');
    results.hidden = false;
  } catch {
    setStatus("Couldn't reach that URL.", true);
  } finally {
    button.disabled = false;
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = input.value.trim();
  if (!url) return;
  const shareable = new URL(window.location.href);
  shareable.searchParams.set('url', url);
  window.history.replaceState(null, '', shareable);
  check(url);
});

// Shareable/demo links: ?url=… auto-runs a check on load.
const preset = new URLSearchParams(window.location.search).get('url');
if (preset) {
  input.value = preset;
  check(preset);
}
