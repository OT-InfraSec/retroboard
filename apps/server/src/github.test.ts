import { describe, expect, it } from "vitest";
import { githubClient, GithubError } from "./github";

const jsonRes = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("githubClient", () => {
  it("posts title, body and labels with the token and returns number and url", async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return jsonRes(201, { number: 42, html_url: "https://github.com/acme/planning/issues/42" });
    }) as unknown as typeof fetch;
    const r = await githubClient("tok", "acme/planning", fetchFn).createIssue({
      title: "T",
      body: "B",
      labels: ["retro"],
    });
    expect(r).toEqual({ number: 42, url: "https://github.com/acme/planning/issues/42" });
    expect(seen!.url).toBe("https://api.github.com/repos/acme/planning/issues");
    expect(JSON.parse(seen!.init.body as string)).toEqual({
      title: "T",
      body: "B",
      labels: ["retro"],
    });
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it.each([
    [401, "invalid GitHub token"],
    [404, "repository not found"],
    [422, "Validation Failed"],
  ])("maps HTTP %i to a user-safe error", async (status, text) => {
    const fetchFn = (async () =>
      jsonRes(status, { message: "Validation Failed" })) as unknown as typeof fetch;
    const p = githubClient("secret-token", "a/b", fetchFn).createIssue({
      title: "t",
      body: "b",
      labels: [],
    });
    await expect(p).rejects.toThrow(GithubError);
    await expect(p).rejects.toThrow(text);
    await expect(p).rejects.not.toThrow(/secret-token/);
  });

  it("reports network failures", async () => {
    const fetchFn = (async () => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    await expect(
      githubClient("t", "a/b", fetchFn).createIssue({ title: "t", body: "b", labels: [] }),
    ).rejects.toThrow("Could not reach GitHub");
  });
});
