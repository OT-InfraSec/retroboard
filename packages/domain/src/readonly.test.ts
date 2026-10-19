import { describe, expect, it } from "vitest";
import { isReadOnly } from "./board";
import { ALICE, newState } from "./testing";

const DAY = 24 * 60 * 60 * 1000;

describe("read-only", () => {
  it("becomes read-only 24h after the last change", () => {
    const s = newState();
    s.advance(DAY - 1);
    expect(isReadOnly(s.board, s.ctx.now)).toBe(false);
    expect(
      s.do({ type: "createCard", columnId: s.cols()[0]!, text: "x", authorName: "a" }, ALICE).ok,
    ).toBe(true);
    s.advance(DAY);
    expect(isReadOnly(s.board, s.ctx.now)).toBe(true);
    const r = s.do(
      { type: "createCard", columnId: s.cols()[0]!, text: "x", authorName: "a" },
      ALICE,
    );
    expect(!r.ok && r.error.code).toBe("read_only");
    expect(s.do({ type: "changePhase", phase: "group" }).ok).toBe(false);
  });

  it("owner can set read-only manually and reopen; reopening resets the window", () => {
    const s = newState();
    s.must({ type: "setReadOnly", readOnly: true });
    expect(s.do({ type: "renameBoard", name: "x" }).ok).toBe(false);
    expect(s.do({ type: "setReadOnly", readOnly: false }, ALICE).ok).toBe(false);
    s.must({ type: "setReadOnly", readOnly: false });
    expect(s.do({ type: "renameBoard", name: "x" }).ok).toBe(true);
  });

  it("an auto read-only board can be reopened", () => {
    const s = newState();
    s.advance(DAY * 3);
    s.must({ type: "setReadOnly", readOnly: false });
    expect(isReadOnly(s.board, s.ctx.now)).toBe(false);
  });

  it("setting read-only stops the discussion timer", () => {
    const s = newState();
    const a = s.card("a");
    s.must({ type: "changePhase", phase: "discuss" });
    s.advance(1000);
    s.must({ type: "setReadOnly", readOnly: true });
    expect(s.board.topicStats[a.id]!.timeMs).toBe(1000);
  });
});
