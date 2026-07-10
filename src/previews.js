// Per-platform effective values (each platform's real fallback chain) and,
// further down (Task 6), the DOM renderers for the preview cards.
import { resolveUrl } from './meta.js';

export const PLATFORMS = ['google', 'x', 'facebook', 'linkedin', 'slack'];

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function effectiveFor(platform, meta, finalUrl) {
  const { og, twitter: tw } = meta;
  const domain = domainOf(finalUrl);
  const base = { domain, url: finalUrl };

  switch (platform) {
    case 'google':
      return {
        ...base,
        title: meta.title || og.title || domain,
        description: meta.metaDescription || og.description || '',
        favicon: meta.favicon,
      };
    case 'x': {
      const card = tw.card || ((og.image || tw.image) ? 'summary_large_image' : 'summary');
      return {
        ...base,
        title: tw.title || og.title || meta.title || domain,
        description: tw.description || og.description || meta.metaDescription || '',
        image: resolveUrl(tw.image || og.image || null, finalUrl),
        large: card === 'summary_large_image',
      };
    }
    case 'facebook':
    case 'linkedin':
      return {
        ...base,
        title: og.title || meta.title || domain,
        description: og.description || meta.metaDescription || '',
        image: resolveUrl(og.image || null, finalUrl),
      };
    case 'slack':
      return {
        ...base,
        title: og.title || tw.title || meta.title || domain,
        description: og.description || tw.description || meta.metaDescription || '',
        image: resolveUrl(og.image || tw.image || null, finalUrl),
        siteName: og.site_name || domain,
        favicon: meta.favicon,
      };
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}
