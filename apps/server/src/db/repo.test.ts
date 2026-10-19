import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { applyAction, connect, createBoard, emptyPresence, type Board } from "@retroboard/domain";
import type { Db } from "./db";
import { boardRepo } from "./repo";
import { migrate } from "./migrations";
import { testDb } from "./testing";

let db: Db;
beforeAll(async () => {
  db = await testDb();
});
afterAll(() => db.close());

let n = 0;
const ctx = { now: 1_700_000_000_000, newId: () => `id${++n}` };

describe("boardRepo", () => {
  it("migrations are idempotent", async () => {
    await migrate(db);
  });

  it("round-trips a board with cards, groups, discussion state, issues and participants", async () => {
    const repo = boardRepo(db);
    const created = createBoard(
      { teamId: "Alpha", templateId: "mad-sad-glad", name: "R", ownerSessionId: "o" },
      ctx,
    );
    if (!created.ok) throw new Error();
    let state = {
      board: created.value as Board,
      presence: connect(emptyPresence(), "o"),
    };
    const run = (a: Parameters<typeof applyAction>[1], who = "o") => {
      ctx.now += 1000;
      const r = applyAction(state, a, who, ctx);
      if (!r.ok) throw new Error(r.error.message);
      state = r.value;
    };
    const col = state.board.columns[0]!.id;
    run({ type: "createCard", columnId: col, text: "a", authorName: "Al" }, "al");
    run({ type: "createCard", columnId: col, text: "b", authorName: "Bo" }, "bo");
    const [a, b] = state.board.cards;
    run({ type: "changePhase", phase: "group" });
    run({ type: "groupCard", cardId: a!.id, targetCardId: b!.id });
    run({ type: "changePhase", phase: "discuss" });
    const topic = state.board.currentTopicId!;
    run({ type: "addIssue", topicId: topic, number: 7, url: "https://x/7", title: "T" });
    run({ type: "navigate", direction: "next" });
    const withParticipant = {
      ...state.board,
      participants: [{ sessionId: "al", publicId: "p1", name: "Al" }],
    };

    await repo.save(withParticipant);
    expect(await repo.load(withParticipant.id)).toEqual(withParticipant);

    // update path: delete a card via edit in Done
    run({ type: "changePhase", phase: "done" });
    run({ type: "deleteCard", cardId: a!.id }, "al");
    await repo.save({ ...state.board, participants: withParticipant.participants });
    const reloaded = await repo.load(withParticipant.id);
    expect(reloaded!.cards).toHaveLength(1);
    expect(reloaded!.cards[0]!.groupId).toBeNull();
    expect(reloaded!.phase).toBe("done");
  });

  it("returns null for unknown boards and lists summaries", async () => {
    const repo = boardRepo(db);
    expect(await repo.load("nope")).toBeNull();
    expect((await repo.listSummaries()).length).toBeGreaterThan(0);
  });
});
