/** Cloudflare draft-16 uses token paths; the scoped adapter uses JWT queries. */
export const CLOUDFLARE_MOQ_ORIGIN = "https://draft-16.cloudflare.mediaoverquic.com"

export function isCloudflareMoq(url: URL): boolean {
  return url.origin === CLOUDFLARE_MOQ_ORIGIN
}
