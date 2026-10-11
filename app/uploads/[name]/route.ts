import { NextResponse } from "next/server";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { storageRoot } from "@/lib/storage";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

// Serves uploaded images. Stored files never live under public/, so this is the
// only way to reach them.
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  // Reject anything that is not a bare filename: no separators, no traversal.
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes("..")) {
    return new NextResponse("bad name", { status: 400 });
  }
  const ext = path.extname(name).toLowerCase();
  const type = TYPES[ext];
  if (!type) return new NextResponse("unsupported type", { status: 415 });

  const full = path.join(storageRoot(), name);
  try {
    const info = await stat(full);
    if (!info.isFile()) return new NextResponse("not found", { status: 404 });
    const body = await readFile(full);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(info.size),
        // Filenames are content-addressed enough for this use, and the bytes
        // never change once written.
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new NextResponse("not found", { status: 404 });
  }
}