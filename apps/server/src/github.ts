export interface GithubClient {
  createIssue(issue: {
    title: string;
    body: string;
    labels: string[];
  }): Promise<{ number: number; url: string }>;
}

/** Message is safe to show to the requesting user; it never contains the token. */
export class GithubError extends Error {}

export function githubClient(
  token: string,
  repo: string,
  fetchFn: typeof fetch = fetch,
  apiUrl = "https://api.github.com",
): GithubClient {
  return {
    async createIssue(issue) {
      let res: Response;
      try {
        res = await fetchFn(`${apiUrl.replace(/\/+$/, "")}/repos/${repo}/issues`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "retroboard",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(issue),
          signal: AbortSignal.timeout(15_000),
        });
      } catch {
        throw new GithubError("Could not reach GitHub");
      }
      if (!res.ok) {
        const detail = ((await res.json().catch(() => null)) as { message?: string } | null)
          ?.message;
        const hint =
          res.status === 401
            ? "invalid GitHub token"
            : res.status === 404
              ? "repository not found or token lacks access"
              : detail;
        throw new GithubError(`GitHub error ${res.status}${hint ? `: ${hint}` : ""}`);
      }
      const data = (await res.json()) as { number: number; html_url: string };
      return { number: data.number, url: data.html_url };
    },
  };
}
