import { describe, expect, it } from "vitest";
import type { IncomingMessage } from "node:http";
import { authCookie, checkAuthCookie, checkBasicAuth, FailureLimiter, sameOrigin } from "./auth";
import { loadConfig } from "./config";
import { parseCookies } from "./session";

const basic = (u: string, p: string) => `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`;

describe("basic auth", () => {
  it("accepts the shared password with any username, rejects everything else", () => {
    expect(checkBasicAuth(basic("anyone", "pw:with:colons"), "pw:with:colons")).toBe(true);
    expect(checkBasicAuth(basic("", "pw"), "pw")).toBe(true);
    expect(checkBasicAuth(basic("a", "nope"), "pw")).toBe(false);
    expect(checkBasicAuth(undefined, "pw")).toBe(false);
    expect(checkBasicAuth("Bearer x", "pw")).toBe(false);
    expect(checkBasicAuth("Basic !!!", "pw")).toBe(false);
  });

  it("blocks cross-origin requests", () => {
    const req = (h: Record<string, string>) => ({ headers: h }) as unknown as IncomingMessage;
    expect(sameOrigin(req({ host: "retro.local" }))).toBe(true);
    expect(sameOrigin(req({ host: "retro.local", origin: "https://retro.local" }))).toBe(true);
    expect(sameOrigin(req({ host: "retro.local", origin: "https://evil.example" }))).toBe(false);
    expect(sameOrigin(req({ host: "retro.local", origin: "garbage" }))).toBe(false);
  });

  it("parses cookies", () => {
    expect(parseCookies("a=1; b=2=3")).toEqual({ a: "1", b: "2=3" });
  });
});

describe("config", () => {
  const env = {
    BASIC_AUTH_PASSWORD: "pw",
    GITHUB_TOKEN: "t",
    GITHUB_REPO: "acme/planning",
    PUBLIC_BASE_URL: "https://retro.example/",
    DATABASE_URL: "postgres://x",
  };
  const file = () => JSON.stringify({ teams: ["Alpha", " Beta "] });

  it("loads, trims and normalises", () => {
    const c = loadConfig(env, file);
    expect(c.teams).toEqual(["Alpha", "Beta"]);
    expect(c.publicBaseUrl).toBe("https://retro.example");
    expect(c.port).toBe(3000);
  });

  it("lists all problems at once", () => {
    expect(() => loadConfig({ GITHUB_REPO: "bad" }, () => "{}")).toThrow(
      /BASIC_AUTH_PASSWORD[\s\S]*GITHUB_TOKEN[\s\S]*owner\/name[\s\S]*teams/,
    );
  });
});

describe("failure limiter", () => {
  it("blocks an address after too many failures and recovers after the window", () => {
    let now = 0;
    const l = new FailureLimiter(3, 1000, () => now);
    for (let i = 0; i < 3; i++) {
      expect(l.blocked("a")).toBe(false);
      l.recordFailure("a");
    }
    expect(l.blocked("a")).toBe(true);
    expect(l.blocked("b")).toBe(false);
    now = 1000;
    expect(l.blocked("a")).toBe(false);
  });
});

describe("auth cookie", () => {
  it("accepts only the cookie derived from the current password", () => {
    const cookie = authCookie("pw", false).split(";")[0]!;
    expect(checkAuthCookie(`a=1; ${cookie}`, "pw")).toBe(true);
    expect(checkAuthCookie(cookie, "other")).toBe(false);
    expect(checkAuthCookie("rb_auth=deadbeef", "pw")).toBe(false);
    expect(checkAuthCookie(undefined, "pw")).toBe(false);
    expect(authCookie("pw", true)).toContain("Secure");
  });
});
