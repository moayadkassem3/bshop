/** Where a visit to a salon's page came from, for the salon's statistics (v1.7). */
export type ViewSource = 'kesfet' | 'kesimler' | 'qr' | 'diger';

const SOURCES: ViewSource[] = ['kesfet', 'kesimler', 'qr', 'diger'];

/** A link to a salon's page that tells its statistics where the visitor came from. */
export function shopHref(slug: string, source: ViewSource): string {
  return `/${slug}?k=${source}`;
}

/** Reads and removes the "?k=" tag, so a copied or shared address carries no source. */
export function takeViewSource(): ViewSource {
  const url = new URL(window.location.href);
  const tag = url.searchParams.get('k');
  if (tag === null) return 'diger';
  url.searchParams.delete('k');
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  return SOURCES.includes(tag as ViewSource) ? (tag as ViewSource) : 'diger';
}

/** What the QR code opens: the salon's link, tagged so scans show up as "QR kod". */
export function qrLink(link: string): string {
  return `${link}?k=qr`;
}
