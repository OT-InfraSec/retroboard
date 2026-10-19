import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** HTTP Basic Auth with one shared password; the username is ignored (SPEC §3.1). */
export function checkBasicAuth(header: string | undefined, password: string): boolean {
  if (!header?.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const idx = decoded.indexOf(":");
  if (idx < 0) return false;
  return timingSafeEqual(digest(decoded.slice(idx + 1)), digest(password));
}

/** Blocks cross-site requests/WebSockets: browsers send Basic credentials cross-site. */
export function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}
