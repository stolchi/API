/** The menu-app address a table's QR code opens. */
export function buildMenuUrl(
  menuAppUrl: string,
  slug: string,
  qrToken: string,
): string {
  const base = menuAppUrl.replace(/\/+$/, '');
  return `${base}/${encodeURIComponent(slug)}?table=${encodeURIComponent(qrToken)}`;
}
