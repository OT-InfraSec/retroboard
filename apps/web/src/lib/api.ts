import type { BoardSummary, Template } from "@retroboard/domain";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface Meta {
  teams: string[];
  templates: Template[];
  defaultNames: Record<string, string>;
}

export const api = {
  me: () => request<{ name: string | null }>("GET", "/api/me"),
  setName: (name: string) => request<{ name: string }>("PUT", "/api/me", { name }),
  meta: () => request<Meta>("GET", "/api/meta"),
  boards: (q: string) =>
    request<{ boards: BoardSummary[] }>("GET", `/api/boards?q=${encodeURIComponent(q)}`),
  createBoard: (input: { teamId: string; templateId: string; name: string }) =>
    request<{ id: string }>("POST", "/api/boards", input),
};
