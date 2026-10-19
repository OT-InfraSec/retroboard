import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

const SID = "rb_sid";
const NAME = "rb_name";
const TEN_YEARS = 10 * 365 * 24 * 3600;
const UUID = /^[0-9a-f-]{36}$/;

export interface SessionInfo {
  sessionId: string;
  name: string | null;
  isNew: boolean;
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const idx = part.indexOf("=");
    if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

export function readSession(req: IncomingMessage): SessionInfo | null {
  const c = parseCookies(req.headers.cookie);
  const sid = c[SID];
  if (!sid || !UUID.test(sid)) return null;
  let name: string | null = null;
  try {
    name = c[NAME] ? decodeURIComponent(c[NAME]) : null;
  } catch {
    name = null;
  }
  return { sessionId: sid, name: name || null, isNew: false };
}

export const newSession = (): SessionInfo => ({ sessionId: randomUUID(), name: null, isNew: true });

const attrs = (secure: boolean) =>
  `Path=/; Max-Age=${TEN_YEARS}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

export const sessionCookie = (sid: string, secure: boolean) => `${SID}=${sid}; ${attrs(secure)}`;
export const nameCookie = (name: string, secure: boolean) =>
  `${NAME}=${encodeURIComponent(name)}; ${attrs(secure)}`;
