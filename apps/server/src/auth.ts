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

/**
 * Slows down password guessing: after `max` failures from one address within `windowMs`,
 * further attempts are refused (without checking the password) until the window passes.
 * Behind a reverse proxy all users share the proxy's address; the lockout is short for that reason.
 */
export class FailureLimiter {
  private failures = new Map<string, { count: number; since: number }>();

  constructor(
    private max = 10,
    private windowMs = 60_000,
    private now: () => number = Date.now,
  ) {}

  blocked(key: string): boolean {
    const f = this.failures.get(key);
    if (!f) return false;
    if (this.now() - f.since >= this.windowMs) {
      this.failures.delete(key);
      return false;
    }
    return f.count >= this.max;
  }

  recordFailure(key: string): void {
    const f = this.failures.get(key);
    if (!f || this.now() - f.since >= this.windowMs)
      this.failures.set(key, { count: 1, since: this.now() });
    else f.count += 1;
    if (this.failures.size > 10_000) this.failures.clear();
  }
}
