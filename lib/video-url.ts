// Pure URL helper. Kept out of lib/video-actions.ts because every export from a
// "use server" module must be an async function, and this one cannot be.

// Orkut videos were either uploads or embeds from YouTube and Google Video. Only
// real embed URLs are accepted, and they are re-checked on the way out so a
// stored URL can never become an iframe pointing somewhere unexpected.
export function videoEmbedUrl(raw: string): string | null {
  const v = raw.trim();
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  const host = u.hostname.replace(/^www\./, "");
  if (host === "youtube.com" || host === "m.youtube.com") {
    const id = u.searchParams.get("v");
    return id && /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtu.be") {
    const id = u.pathname.slice(1);
    return /^[\w-]{6,20}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com") {
    const id = u.pathname.split("/").filter(Boolean)[0];
    return id && /^\d+$/.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  // A direct file link is fine too.
  if (/\.(mp4|webm|ogv)$/i.test(u.pathname)) return v;
  return null;
}