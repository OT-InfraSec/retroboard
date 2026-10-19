import { readFileSync } from "node:fs";

export interface Config {
  port: number;
  basicAuthPassword: string;
  githubToken: string;
  githubRepo: string;
  publicBaseUrl: string;
  databaseUrl: string;
  teams: string[];
}

/** Fails fast with every problem listed, so a misconfigured deployment is easy to fix. */
export function loadConfig(
  env: Record<string, string | undefined>,
  readFile: (path: string) => string = (p) => readFileSync(p, "utf8"),
): Config {
  const problems: string[] = [];
  const required = (key: string): string => {
    const v = env[key]?.trim();
    if (!v) problems.push(`${key} is required`);
    return v ?? "";
  };

  const basicAuthPassword = required("BASIC_AUTH_PASSWORD");
  const githubToken = required("GITHUB_TOKEN");
  const githubRepo = required("GITHUB_REPO");
  const publicBaseUrl = required("PUBLIC_BASE_URL").replace(/\/+$/, "");
  const databaseUrl = required("DATABASE_URL");
  if (githubRepo && !/^[\w.-]+\/[\w.-]+$/.test(githubRepo))
    problems.push("GITHUB_REPO must look like owner/name");
  if (publicBaseUrl && !/^https?:\/\//.test(publicBaseUrl))
    problems.push("PUBLIC_BASE_URL must start with http:// or https://");

  let teams: string[] = [];
  const teamsFile = env.TEAMS_FILE ?? "config/teams.json";
  try {
    const parsed = JSON.parse(readFile(teamsFile)) as { teams?: unknown };
    if (
      Array.isArray(parsed.teams) &&
      parsed.teams.length > 0 &&
      parsed.teams.every((t) => typeof t === "string" && t.trim())
    )
      teams = (parsed.teams as string[]).map((t) => t.trim());
    else problems.push(`${teamsFile} must contain {"teams": ["Alpha", ...]}`);
  } catch {
    problems.push(`Cannot read teams file ${teamsFile}`);
  }

  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) problems.push("PORT must be a positive integer");

  if (problems.length) throw new Error(`Invalid configuration:\n- ${problems.join("\n- ")}`);
  return { port, basicAuthPassword, githubToken, githubRepo, publicBaseUrl, databaseUrl, teams };
}
