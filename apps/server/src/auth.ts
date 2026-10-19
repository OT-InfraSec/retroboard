import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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

const AUTH_COOKIE = "rb_auth";

/**
 * Browsers cache Basic credentials per URL directory and cannot answer a 401 during a
 * WebSocket handshake, so a deep link (/boards/…) would leave /ws/… without credentials.
 * After a successful Basic login we therefore also set this cookie, derived from the password
 * (changing the password invalidates it), which the WebSocket upgrade accepts.
 */
const authToken = (password: string) =>
  createHmac("sha256", password).update("retroboard-auth-cookie-v1").digest("hex");

export const authCookie = (password: string, secure: boolean) =>
  `${AUTH_COOKIE}=${authToken(password)}; Path=/; Max-Age=${30 * 24 * 3600}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

export function checkAuthCookie(cookieHeader: string | undefined, password: string): boolean {
  const value = /(?:^|;\s*)rb_auth=([0-9a-f]{64})(?:;|$)/.exec(cookieHeader ?? "")?.[1];
  return !!value && timingSafeEqual(Buffer.from(value), Buffer.from(authToken(password)));
}
