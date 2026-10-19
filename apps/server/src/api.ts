import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createBoard,
  defaultBoardName,
  searchBoards,
  sortBoards,
  TEMPLATES,
} from "@retroboard/domain";
import { CreateBoardRequest, SetNameRequest } from "@retroboard/protocol";
import type { Config } from "./config";
import type { BoardRepo } from "./db/repo";
import { nameCookie, type SessionInfo } from "./session";

export interface ApiDeps {
  config: Pick<Config, "teams" | "publicBaseUrl">;
  repo: BoardRepo;
  now?: () => number;
  newId?: () => string;
}

const MAX_BODY = 4096;

function sendJson(res: ServerResponse, status: number, body: unknown, cookies: string[] = []) {
  const existing = res.getHeader("Set-Cookie");
  const all = [
    ...(Array.isArray(existing) ? existing : existing ? [String(existing)] : []),
    ...cookies,
  ];
  if (all.length) res.setHeader("Set-Cookie", all);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw new Error("content-type");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("too large");
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/** Returns true when the request was handled. */
export async function handleApi(
  req: IncomingMessage,
  res: ServerResponse,
  session: SessionInfo,
  deps: ApiDeps,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/")) return false;
  const now = deps.now ?? Date.now;
  const newId = deps.newId ?? (() => crypto.randomUUID());
  const secure = deps.config.publicBaseUrl.startsWith("https:");
  const route = `${req.method} ${url.pathname}`;

  try {
    switch (route) {
      case "GET /api/me":
        sendJson(res, 200, { name: session.name });
        return true;

      case "PUT /api/me": {
        const body = SetNameRequest.safeParse(await readJson(req));
        if (!body.success) return (sendJson(res, 400, { error: "Name is required" }), true);
        sendJson(res, 200, { name: body.data.name }, [nameCookie(body.data.name, secure)]);
        return true;
      }

      case "GET /api/meta":
        sendJson(res, 200, {
          teams: deps.config.teams,
          templates: TEMPLATES,
          defaultNames: Object.fromEntries(
            deps.config.teams.map((t) => [t, defaultBoardName(t, new Date(now()))]),
          ),
        });
        return true;

      case "GET /api/boards": {
        const boards = sortBoards(
          searchBoards(await deps.repo.listSummaries(), url.searchParams.get("q") ?? ""),
        );
        sendJson(res, 200, { boards });
        return true;
      }

      case "POST /api/boards": {
        const body = CreateBoardRequest.safeParse(await readJson(req));
        if (!body.success) return (sendJson(res, 400, { error: "Invalid request" }), true);
        if (!deps.config.teams.includes(body.data.teamId))
          return (sendJson(res, 400, { error: "Unknown team" }), true);
        const created = createBoard(
          { ...body.data, ownerSessionId: session.sessionId },
          { now: now(), newId },
        );
        if (!created.ok) return (sendJson(res, 400, { error: created.error.message }), true);
        await deps.repo.save(created.value);
        sendJson(res, 201, { id: created.value.id });
        return true;
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (message === "content-type" || message === "too large" || err instanceof SyntaxError)
      return (sendJson(res, 400, { error: "Bad request" }), true);
    console.error("api error", err);
    sendJson(res, 500, { error: "Internal error" });
    return true;
  }
  sendJson(res, 404, { error: "Not found" });
  return true;
}
