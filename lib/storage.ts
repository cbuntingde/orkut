import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Uploaded files live outside public/ on purpose. Next only serves what it
 * built, so files written under public/ at runtime are not reliably reachable,
 * and the standalone Docker image is read-only in practice. A data directory
 * plus the /uploads/[name] route works the same way in dev and in the container.
 */
export function storageRoot(): string {
  return process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads");
}

export function uploadDir(): string {
  const dir = storageRoot();
  mkdirSync(dir, { recursive: true });
  return dir;
}