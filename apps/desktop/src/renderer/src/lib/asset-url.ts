/**
 * Renderer-safe package asset URL.
 *
 * Assets are content-addressed, so the id alone identifies the bytes and the
 * main process can resolve it against any live document package. The custom
 * scheme is registered in the main process; the renderer never receives a
 * filesystem path and never fetches a remote URL.
 */

export function assetUrlFor(assetId: string): string {
  return `noteforest-asset://asset/${encodeURIComponent(assetId)}`;
}
