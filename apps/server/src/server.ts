import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Duplex } from "node:stream";
import { WebSocketServer } from "ws";
import { MAX_MESSAGE_BYTES } from "@retroboard/protocol";
import { handleApi } from "./api";
import { checkBasicAuth, sameOrigin } from "./auth";
import type { Config } from "./config";
import type { BoardRepo } from "./db/repo";
import type { GithubClient } from "./github";
import { Hub } from "./hub";
import { newSession, readSession, sessionCookie, type SessionInfo } from "./session";

export interface AppDeps {
  config: Config;
  repo: BoardRepo;
  github: GithubClient;
  /** Next.js request handler (or a stub in tests). */
  uiHandler: (req: IncomingMessage, res: ServerResponse) => unknown;
  /** Passes unmatched upgrade requests (e.g. Next dev HMR) through. */
  uiUpgrade?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  now?: () => number;
}

export interface App {
  server: Server;
  hub: Hub;
  close(): void;
}

const WS_PATH = /^\/ws\/boards\/([\w-]{1,100})$/;

export function createApp(deps: AppDeps): App {
  const { config } = deps;
  const hub = new Hub({
    repo: deps.repo,
    github: deps.github,
    publicBaseUrl: config.publicBaseUrl,
    now: deps.now,
  });
  const secure = config.publicBaseUrl.startsWith("https:");
  const unauthorized = (res: ServerResponse) => {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Retroboard", charset="UTF-8"' });
    res.end("Authentication required");
  };

  const server = createServer(async (req, res) => {
    // Unauthenticated, information-free liveness probe for Docker.
    if (req.url === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      return void res.end("ok");
    }
    if (!checkBasicAuth(req.headers.authorization, config.basicAuthPassword))
      return unauthorized(res);

    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD" && !sameOrigin(req)) {
      res.writeHead(403);
      return void res.end("Forbidden");
    }

    const session: SessionInfo = readSession(req) ?? newSession();
    if (session.isNew) res.setHeader("Set-Cookie", sessionCookie(session.sessionId, secure));

    try {
      if (await handleApi(req, res, session, { config, repo: deps.repo, now: deps.now })) return;
      await deps.uiHandler(req, res);
    } catch (err) {
      console.error("request failed", err);
      if (!res.headersSent) res.writeHead(500);
      res.end("Internal error");
    }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on("upgrade", (req, socket, head) => {
    const match = WS_PATH.exec(new URL(req.url ?? "/", "http://localhost").pathname);
    if (!match) {
      if (deps.uiUpgrade) return deps.uiUpgrade(req, socket, head);
      return void socket.destroy();
    }
    const reject = (line: string) => {
      socket.write(`HTTP/1.1 ${line}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
    };
    if (!checkBasicAuth(req.headers.authorization, config.basicAuthPassword))
      return reject("401 Unauthorized");
    if (!sameOrigin(req)) return reject("403 Forbidden");
    const session = readSession(req);
    if (!session?.name) return reject("401 Unauthorized");

    const boardId = match[1]!;
    wss.handleUpgrade(req, socket, head, (ws) => {
      let conn: Awaited<ReturnType<Hub["connect"]>> = null;
      let closed = false;
      // Messages that arrive while the connection is being registered are queued in order.
      let chain: Promise<unknown> = hub
        .connect(boardId, session.sessionId, session.name!, {
          send: (d) => ws.send(d),
          close: (c, r) => ws.close(c, r),
        })
        .then((c) => {
          conn = c;
          if (closed && c) return hub.disconnect(boardId, c);
        });
      ws.on("message", (data) => {
        const raw = data.toString();
        chain = chain
          .then(() => conn && hub.handleMessage(boardId, conn, raw))
          .catch((e) => console.error(e));
      });
      ws.on("close", () => {
        closed = true;
        chain = chain
          .then(() => conn && hub.disconnect(boardId, conn))
          .catch((e) => console.error(e));
      });
      ws.on("error", () => ws.terminate());
    });
  });

  const sweeper = setInterval(() => void hub.sweep().catch((e) => console.error(e)), 30_000);
  sweeper.unref();

  return {
    server,
    hub,
    close() {
      clearInterval(sweeper);
      wss.clients.forEach((c) => c.terminate());
      server.close();
    },
  };
}
