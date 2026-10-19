import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { BoardView } from "@retroboard/domain";
import type { ServerMessage } from "@retroboard/protocol";
import { createApp, type App } from "./server";
import { boardRepo } from "./db/repo";
import { testDb } from "./db/testing";
import { GithubError, type GithubClient } from "./github";
import type { Config } from "./config";
import type { Db } from "./db/db";

const AUTH = `Basic ${Buffer.from("x:pw").toString("base64")}`;
let app: App;
let db: Db;
let base: string;
const githubCalls: { title: string; body: string; labels: string[] }[] = [];
let githubFails = false;

const github: GithubClient = {
  async createIssue(issue) {
    if (githubFails) throw new GithubError("GitHub error 401: invalid GitHub token");
    githubCalls.push(issue);
    return {
      number: githubCalls.length,
      url: `https://github.com/acme/planning/issues/${githubCalls.length}`,
    };
  },
};

beforeAll(async () => {
  db = await testDb();
  const config: Config = {
    port: 0,
    basicAuthPassword: "pw",
    githubToken: "t",
    githubRepo: "acme/planning",
    publicBaseUrl: "https://retro.example",
    databaseUrl: "",
    teams: ["Alpha", "Beta"],
  };
  app = createApp({
    config,
    repo: boardRepo(db),
    github,
    uiHandler: (_req, res) => void res.writeHead(200).end("ui"),
  });
  await new Promise<void>((r) => app.server.listen(0, r));
  base = `127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  app.close();
  await new Promise((r) => setTimeout(r, 200));
  await db.close();
});

class Client {
  cookie = "";
  ws!: WebSocket;
  views: BoardView[] = [];
  msgs: ServerMessage[] = [];
  private waiters: (() => void)[] = [];

  async init(name: string) {
    const res = await fetch(`http://${base}/`, { headers: { Authorization: AUTH } });
    this.cookie = (res.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ");
    const put = await this.api("PUT", "/api/me", { name });
    this.cookie += "; " + (put.headers.getSetCookie() ?? []).map((c) => c.split(";")[0]).join("; ");
    return this;
  }
  api(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    return fetch(`http://${base}${path}`, {
      method,
      headers: {
        Authorization: AUTH,
        Cookie: this.cookie,
        "Content-Type": "application/json",
        ...extra,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }
  async open(boardId: string) {
    this.ws = new WebSocket(`ws://${base}/ws/boards/${boardId}`, {
      headers: { Authorization: AUTH, Cookie: this.cookie },
    });
    this.ws.on("message", (d) => {
      const m = JSON.parse(d.toString()) as ServerMessage;
      this.msgs.push(m);
      if (m.type === "state") this.views.push(m.view);
      this.waiters.splice(0).forEach((w) => w());
    });
    await new Promise((res, rej) => {
      this.ws.once("open", res);
      this.ws.once("error", rej);
    });
    await this.until(() => this.views.length > 0);
    return this;
  }
  send(msg: object, requestId = "r") {
    this.ws.send(JSON.stringify({ ...msg, requestId }));
  }
  async until(pred: () => boolean) {
    const deadline = Date.now() + 3000;
    while (!pred()) {
      if (Date.now() > deadline) throw new Error("timeout");
      await new Promise<void>((r) => {
        this.waiters.push(r);
        setTimeout(r, 50);
      });
    }
  }
  get view() {
    return this.views.at(-1)!;
  }
  lastError() {
    return this.msgs.findLast((m) => m.type === "error") as { message: string } | undefined;
  }
}

const createBoard = async (c: Client) => {
  const res = await c.api("POST", "/api/boards", {
    teamId: "Alpha",
    templateId: "start-stop-continue",
    name: "Retro",
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { id: string }).id;
};

describe("http", () => {
  it("requires basic auth everywhere except /healthz", async () => {
    expect((await fetch(`http://${base}/`)).status).toBe(401);
    expect((await fetch(`http://${base}/api/boards`)).status).toBe(401);
    expect((await fetch(`http://${base}/healthz`)).status).toBe(200);
    expect((await fetch(`http://${base}/`, { headers: { Authorization: AUTH } })).status).toBe(200);
  });

  it("sends security headers", async () => {
    const res = await fetch(`http://${base}/`, { headers: { Authorization: AUTH } });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });

  it("issues an HttpOnly session cookie and stores the display name", async () => {
    const res = await fetch(`http://${base}/`, { headers: { Authorization: AUTH } });
    expect(res.headers.getSetCookie()[0]).toMatch(
      /^rb_sid=[0-9a-f-]{36}; .*HttpOnly.*SameSite=Lax.*Secure/,
    );
    const c = await new Client().init("Ada");
    expect(await (await c.api("GET", "/api/me")).json()).toEqual({ name: "Ada" });
  });

  it("rejects cross-site writes and non-JSON bodies", async () => {
    const c = await new Client().init("Ada");
    const evil = await c.api("PUT", "/api/me", { name: "x" }, { Origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    const form = await fetch(`http://${base}/api/me`, {
      method: "PUT",
      headers: { Authorization: AUTH, Cookie: c.cookie, "Content-Type": "text/plain" },
      body: '{"name":"x"}',
    });
    expect(form.status).toBe(400);
  });

  it("lists, searches and sorts boards; validates creation", async () => {
    const c = await new Client().init("Ada");
    const id = await createBoard(c);
    const list = (await (await c.api("GET", "/api/boards?q=RETR")).json()) as {
      boards: { id: string }[];
    };
    expect(list.boards.map((b) => b.id)).toContain(id);
    const none = (await (await c.api("GET", "/api/boards?q=zzzzzz")).json()) as {
      boards: unknown[];
    };
    expect(none.boards).toHaveLength(0);
    expect(
      (await c.api("POST", "/api/boards", { teamId: "Nope", templateId: "4ls", name: "x" })).status,
    ).toBe(400);
    expect(
      (await c.api("POST", "/api/boards", { teamId: "Alpha", templateId: "bad", name: "x" }))
        .status,
    ).toBe(400);
    const meta = (await (await c.api("GET", "/api/meta")).json()) as {
      teams: string[];
      templates: unknown[];
    };
    expect(meta.teams).toEqual(["Alpha", "Beta"]);
    expect(meta.templates).toHaveLength(5);
  });
});

describe("websocket", () => {
  it("rejects connections without auth or without a display name", async () => {
    const owner = await new Client().init("Olga");
    const id = await createBoard(owner);
    const noAuth = new WebSocket(`ws://${base}/ws/boards/${id}`);
    await expect(new Promise((_, rej) => noAuth.once("error", rej))).rejects.toThrow(/401/);
    const anon = new Client();
    anon.cookie = "";
    const res = await fetch(`http://${base}/`, { headers: { Authorization: AUTH } });
    anon.cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ");
    await expect(anon.open(id)).rejects.toThrow(/401/);
  });

  it("closes with 4404 for unknown boards", async () => {
    const c = await new Client().init("Ada");
    const ws = new WebSocket(`ws://${base}/ws/boards/missing`, {
      headers: { Authorization: AUTH, Cookie: c.cookie },
    });
    const code = await new Promise<number>((r) => ws.on("close", r));
    expect(code).toBe(4404);
  });

  it("runs the main retro flow with several clients", async () => {
    const owner = await new Client().init("Olga");
    const alice = await new Client().init("Alice");
    const bob = await new Client().init("Bob");
    const id = await createBoard(owner);
    await owner.open(id);
    await alice.open(id);
    await bob.open(id);
    await owner.until(() => owner.view.participants.length === 3);
    expect(owner.view.viewer.isOwner).toBe(true);
    const [start, stop] = owner.view.columns.map((c) => c.id) as [string, string];

    // Write: cards are blurred for others, and their text never reaches the wire.
    alice.send({ type: "createCard", columnId: start, text: "Alice secret one" });
    alice.send({ type: "createCard", columnId: start, text: "Alice two" });
    bob.send({ type: "createCard", columnId: start, text: "Bob secret" });
    await bob.until(() => bob.view.cards.length === 3);
    await alice.until(() => alice.view.cards.length === 3);
    const bobWire = JSON.stringify(bob.msgs);
    expect(bobWire).toContain("Bob secret");
    expect(bobWire).not.toContain("Alice secret one");
    expect(JSON.stringify(owner.msgs)).not.toContain("Alice secret one");
    expect(alice.view.cards.filter((c) => c.text !== null)).toHaveLength(2);

    // Non-owners cannot switch phase.
    alice.send({ type: "changePhase", phase: "group" });
    await alice.until(() => !!alice.lastError());
    expect(alice.lastError()!.message).toMatch(/owner/i);

    // Group: the owner sees everything, groups two cards, which reveals them.
    owner.send({ type: "changePhase", phase: "group" });
    await owner.until(
      () => owner.view.phase === "group" && owner.view.cards.every((c) => c.text !== null),
    );
    const [a1, a2] = owner.view.cards.filter((c) => c.text?.startsWith("Alice"));
    owner.send({ type: "groupCard", cardId: a1!.id, targetCardId: a2!.id });
    await bob.until(() => bob.view.cards.filter((c) => c.text !== null).length === 3);
    expect(bob.view.cards.find((c) => c.id === a1!.id)!.groupId).toBeTruthy();

    // Discuss: single topic for everybody; owner navigates; timer persisted.
    owner.send({ type: "changePhase", phase: "discuss" });
    await bob.until(() => bob.view.phase === "discuss");
    expect(bob.view.discussion).toMatchObject({ index: 0, count: 2, running: true });
    expect(bob.view.cards).toHaveLength(2); // the group
    bob.send({ type: "createCard", columnId: stop, text: "Added late" });
    await bob.until(() => bob.view.discussion?.count === 3);

    // Issue creation (GitHub mocked): anyone can create; stored and broadcast.
    const topic = bob.view.discussion!.currentTopicId!;
    bob.send({ type: "createIssue", topicId: topic, description: "More" }, "issue1");
    await owner.until(() => owner.view.issues.length === 1);
    expect(githubCalls[0]).toMatchObject({ labels: ["retro"] });
    expect(githubCalls[0]!.body).toContain(`https://retro.example/boards/${id}?topic=${topic}`);
    expect(githubCalls[0]!.body).toContain("More");

    // GitHub failure → error to the requester only, nothing stored.
    githubFails = true;
    alice.msgs = [];
    alice.send({ type: "createIssue", topicId: topic }, "issue2");
    await alice.until(() => !!alice.lastError());
    expect(alice.lastError()!.message).toMatch(/invalid GitHub token/);
    expect(owner.view.issues).toHaveLength(1);
    githubFails = false;

    owner.send({ type: "navigate", direction: "next" });
    await alice.until(() => alice.view.discussion?.index === 1);
    expect(alice.view.discussion!.discussedTopicIds).toContain(topic);

    // Done: full board unblurred for everyone, issue titles visible.
    owner.send({ type: "changePhase", phase: "done" });
    await bob.until(() => bob.view.phase === "done");
    expect(bob.view.cards).toHaveLength(4);
    expect(bob.view.cards.every((c) => c.text !== null)).toBe(true);
    expect(bob.view.issues).toHaveLength(1);

    // Persistence: state survives a reload from the database.
    const stored = await boardRepo(db).load(id);
    expect(stored!.phase).toBe("done");
    expect(stored!.topicStats[topic]!.discussed).toBe(true);
    expect(stored!.issues).toHaveLength(1);

    for (const c of [owner, alice, bob]) c.ws.close();
  });

  it("handles owner offline → temporary owner → owner returns", async () => {
    const owner = await new Client().init("Olga");
    const alice = await new Client().init("Alice");
    const bob = await new Client().init("Bob");
    const id = await createBoard(owner);
    await alice.open(id);
    await bob.open(id);
    expect(alice.view.viewer.hasOwnerRights).toBe(true); // owner offline → open rights

    alice.send({ type: "changePhase", phase: "group" });
    await bob.until(() => bob.view.phase === "group");
    expect(bob.view.viewer.hasOwnerRights).toBe(false);
    expect(alice.view.viewer.isTemporaryOwner).toBe(true);

    await owner.open(id);
    expect(owner.view.viewer.ownerReturnPrompt).toBe(true);
    owner.send({ type: "resolveOwnerReturn", choice: "decline" });
    await alice.until(() => !!alice.view.viewer.isOwner);
    expect(alice.view.viewer.hasOwnerRights).toBe(true);
    expect(owner.view.viewer.hasOwnerRights).toBe(false);
    for (const c of [owner, alice, bob]) c.ws.close();
  });

  it("rejects malformed messages and oversized payloads", async () => {
    const c = await new Client().init("Ada");
    const id = await createBoard(c);
    await c.open(id);
    c.ws.send("not json");
    await c.until(() => !!c.lastError());
    expect(c.lastError()!.message).toBe("Invalid message");
    c.send({ type: "createCard", columnId: c.view.columns[0]!.id, text: "x".repeat(501) });
    await c.until(() => c.msgs.filter((m) => m.type === "error").length === 2);
    const code = await new Promise<number>((r) => {
      c.ws.on("close", r);
      c.ws.send("x".repeat(20_000));
    });
    expect(code).toBe(1009);
  });
});
