// Shared CSRF constants. Kept free of `node:` imports and `next/headers` so the
// edge middleware and the Node route handlers can both use it.

export const CSRF_COOKIE = "orkut_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Uses the Web Crypto global, which exists on both the edge and Node runtimes. */
export function newCsrfToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}