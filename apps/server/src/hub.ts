import {
  applyAction,
  composeIssue,
  connect as presenceConnect,
  deepLink,
  disconnect as presenceDisconnect,
  emptyPresence,
  isReadOnly,
  joinBoard,
  projectBoard,
  stopTimer,
  topicIdOf,
  type Action,
  type Board,
  type Ctx,
  type Presence,
} from "@retroboard/domain";
import { ClientEnvelope, type ClientMessage, type ServerMessage } from "@retroboard/protocol";
import type { BoardRepo } from "./db/repo";
import { GithubError, type GithubClient } from "./github";

export interface Socket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface Conn {
  socket: Socket;
  sessionId: string;
  name: string;
  tokens: number;
  refilledAt: number;
}

interface Room {
  id: string;
  board: Board;
  presence: Presence;
  conns: Set<Conn>;
  queue: Promise<unknown>;
  readOnly: boolean;
}

export interface HubDeps {
  repo: BoardRepo;
  github: GithubClient;
  publicBaseUrl: string;
  now?: () => number;
  newId?: () => string;
  log?: (msg: string, err?: unknown) => void;
}

const BURST = 20;
const REFILL_PER_SEC = 5;

export class Hub {
  private rooms = new Map<string, Promise<Room | null>>();
  private now: () => number;
  private newId: () => string;
  private log: (msg: string, err?: unknown) => void;

  constructor(private deps: HubDeps) {
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.log = deps.log ?? ((m, e) => console.error(m, e));
  }

  private ctx(): Ctx {
    return { now: this.now(), newId: this.newId };
  }

  private getRoom(boardId: string): Promise<Room | null> {
    let p = this.rooms.get(boardId);
    if (!p) {
      p = this.deps.repo.load(boardId).then((board) =>
        board
          ? {
              id: boardId,
              // A timer left running by a crash or empty room is not trusted (ADR-003).
              board: { ...board, currentTopicStartedAt: null },
              presence: emptyPresence(),
              conns: new Set<Conn>(),
              queue: Promise.resolve(),
              readOnly: isReadOnly(board, this.now()),
            }
          : null,
      );
      this.rooms.set(boardId, p);
      p.then((room) => !room && this.rooms.delete(boardId)).catch(() => this.rooms.delete(boardId));
    }
    return p;
  }

  /** Runs fn after all earlier work for this room; errors never break the queue. */
  private run<T>(room: Room, fn: () => Promise<T>): Promise<T> {
    const next = room.queue.then(fn, fn);
    room.queue = next.catch(() => undefined);
    return next;
  }

  private send(conn: Conn, msg: ServerMessage) {
    try {
      conn.socket.send(JSON.stringify(msg));
    } catch {
      /* socket already closing */
    }
  }

  private broadcast(room: Room) {
    const now = this.now();
    for (const conn of room.conns)
      this.send(conn, {
        type: "state",
        view: projectBoard(room.board, room.presence, conn.sessionId, now),
        serverTime: now,
      });
  }

  async connect(
    boardId: string,
    sessionId: string,
    name: string,
    socket: Socket,
  ): Promise<Conn | null> {
    let room: Room | null;
    try {
      room = await this.getRoom(boardId);
    } catch (err) {
      this.log("failed to load board", err);
      socket.close(1011, "Could not load board");
      return null;
    }
    if (!room) {
      socket.close(4404, "Board not found");
      return null;
    }
    const r = room;
    const conn: Conn = { socket, sessionId, name, tokens: BURST, refilledAt: this.now() };
    await this.run(r, async () => {
      const wasEmpty = r.conns.size === 0;
      const joined = joinBoard(r.board, sessionId, name, this.ctx());
      if (joined !== r.board) {
        try {
          await this.deps.repo.save(joined);
        } catch (err) {
          this.log("failed to save participant", err);
        }
        r.board = joined;
      }
      r.presence = presenceConnect(r.presence, sessionId);
      r.conns.add(conn);
      if (
        wasEmpty &&
        r.board.phase === "discuss" &&
        r.board.currentTopicId &&
        !isReadOnly(r.board, this.now())
      )
        r.board = { ...r.board, currentTopicStartedAt: this.now() };
      this.broadcast(r);
    });
    return conn;
  }

  async disconnect(boardId: string, conn: Conn): Promise<void> {
    const room = await this.getRoom(boardId);
    if (!room) return;
    await this.run(room, async () => {
      if (!room.conns.delete(conn)) return;
      const stillOnline = [...room.conns].some((c) => c.sessionId === conn.sessionId);
      if (!stillOnline) room.presence = presenceDisconnect(room.presence, conn.sessionId);
      if (room.conns.size === 0) {
        // Nobody is watching: stop the timer and drop the room from memory.
        room.board = stopTimer(room.board, this.now());
        try {
          await this.deps.repo.save(room.board);
        } catch (err) {
          this.log("failed to save board on close", err);
        }
        this.rooms.delete(room.id);
        return;
      }
      this.broadcast(room);
    });
  }

  async handleMessage(boardId: string, conn: Conn, raw: string): Promise<void> {
    const room = await this.getRoom(boardId);
    if (!room) return;

    const now = this.now();
    conn.tokens = Math.min(BURST, conn.tokens + ((now - conn.refilledAt) / 1000) * REFILL_PER_SEC);
    conn.refilledAt = now;
    if (conn.tokens < 1) return this.send(conn, { type: "error", message: "Too many requests" });
    conn.tokens -= 1;

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return this.send(conn, { type: "error", message: "Invalid message" });
    }
    const parsed = ClientEnvelope.safeParse(json);
    if (!parsed.success) return this.send(conn, { type: "error", message: "Invalid message" });
    const { requestId, ...msg } = parsed.data as { requestId?: string } & ClientMessage;

    if (msg.type === "createIssue") return this.createIssue(room, conn, msg, requestId);

    await this.run(room, async () => {
      const action = toAction(msg, conn.name);
      const result = applyAction(
        { board: room.board, presence: room.presence },
        action,
        conn.sessionId,
        this.ctx(),
      );
      if (!result.ok)
        return this.send(conn, { type: "error", message: result.error.message, requestId });
      try {
        await this.deps.repo.save(result.value.board);
      } catch (err) {
        this.log("failed to save board", err);
        return this.send(conn, { type: "error", message: "Could not save your change", requestId });
      }
      room.board = result.value.board;
      room.presence = result.value.presence;
      room.readOnly = isReadOnly(room.board, this.now());
      this.send(conn, { type: "ok", requestId });
      this.broadcast(room);
    });
  }

  private async createIssue(
    room: Room,
    conn: Conn,
    msg: Extract<ClientMessage, { type: "createIssue" }>,
    requestId: string | undefined,
  ) {
    const fail = (message: string) => this.send(conn, { type: "error", message, requestId });
    const draft = await this.run(room, async () => {
      const b = room.board;
      if (isReadOnly(b, this.now())) return fail("Board is read-only");
      if (b.phase !== "discuss") return fail("Issues are created in Discuss");
      if (b.currentTopicId !== msg.topicId) return fail("Topic is not the current topic");
      const cards = b.cards.filter((c) => topicIdOf(c) === msg.topicId);
      if (!cards.length) return fail("Topic not found");
      return composeIssue({
        cards,
        title: msg.title,
        description: msg.description,
        link: deepLink(this.deps.publicBaseUrl, b.id, msg.topicId),
      });
    });
    if (!draft) return;

    let created: { number: number; url: string };
    try {
      created = await this.deps.github.createIssue(draft);
    } catch (err) {
      return fail(err instanceof GithubError ? err.message : "Could not create the GitHub issue");
    }

    await this.run(room, async () => {
      const result = applyAction(
        { board: room.board, presence: room.presence },
        { type: "addIssue", topicId: msg.topicId, ...created, title: draft.title },
        conn.sessionId,
        this.ctx(),
      );
      if (!result.ok)
        return fail(
          `Issue was created on GitHub (${created.url}) but could not be linked: ${result.error.message}`,
        );
      try {
        await this.deps.repo.save(result.value.board);
      } catch (err) {
        this.log("failed to save issue link", err);
        return fail(`Issue was created on GitHub (${created.url}) but could not be saved`);
      }
      room.board = result.value.board;
      this.send(conn, { type: "ok", requestId, issue: { ...created, title: draft.title } });
      this.broadcast(room);
    });
  }

  /** Auto read-only after 24h: stop timers and tell clients when a board flips (SPEC §7). */
  async sweep(): Promise<void> {
    for (const p of [...this.rooms.values()]) {
      const room = await p.catch(() => null);
      if (!room) continue;
      await this.run(room, async () => {
        const ro = isReadOnly(room.board, this.now());
        if (ro === room.readOnly) return;
        room.readOnly = ro;
        if (ro) {
          room.board = stopTimer(room.board, this.now());
          try {
            await this.deps.repo.save(room.board);
          } catch (err) {
            this.log("failed to save board in sweep", err);
          }
        }
        this.broadcast(room);
      });
    }
  }
}

function toAction(
  msg: Exclude<ClientMessage, { type: "createIssue" }>,
  authorName: string,
): Action {
  return msg.type === "createCard" ? { ...msg, authorName } : msg;
}
