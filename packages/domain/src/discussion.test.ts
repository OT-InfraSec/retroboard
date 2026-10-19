import { describe, expect, it } from "vitest";
import { computeDiscussionOrder, topicIdOf, topicTimeMs } from "./discussion";
import { ALICE, newState } from "./testing";

const toDiscuss = (s: ReturnType<typeof newState>) =>
  s.must({ type: "changePhase", phase: "discuss" });

describe("discussion order", () => {
  it("orders columns left to right, then by creation time; groups by earliest card", () => {
    const s = newState();
    const a = s.card("a0", 0);
    const b = s.card("b0", 1);
    const c = s.card("a1", 0);
    const d = s.card("a2", 0);
    s.must({ type: "changePhase", phase: "group" });
    s.must({ type: "groupCard", cardId: d.id, targetCardId: a.id }); // group earliest = a
    expect(computeDiscussionOrder(s.board)).toEqual([topicIdOf(s.board.cards[0]!), c.id, b.id]);
    toDiscuss(s);
    expect(s.board.discussionOrder).toEqual([s.board.cards[0]!.groupId, c.id, b.id]);
    expect(s.board.currentTopicId).toBe(s.board.discussionOrder[0]);
  });

  it("appends cards created during Discuss regardless of column", () => {
    const s = newState();
    const a = s.card("a", 2);
    toDiscuss(s);
    const late = s.card("late", 0);
    expect(s.board.discussionOrder).toEqual([a.id, late.id]);
  });

  it("recalculates on re-entry but keeps times and discussed marks", () => {
    const s = newState();
    const a = s.card("a", 0);
    const b = s.card("b", 0);
    toDiscuss(s);
    s.advance(5000);
    s.must({ type: "navigate", direction: "next" });
    s.must({ type: "changePhase", phase: "group" });
    s.must({ type: "changePhase", phase: "discuss" });
    expect(s.board.topicStats[a.id]).toEqual({ timeMs: 5000, discussed: true });
    expect(s.board.currentTopicId).toBe(a.id);
    expect(b.id).toBe(s.board.discussionOrder[1]);
  });
});

describe("timer & navigation", () => {
  it("accumulates time per topic across back/forward navigation and does not skip discussed", () => {
    const s = newState();
    const a = s.card("a");
    const b = s.card("b");
    toDiscuss(s);
    s.advance(3000);
    expect(topicTimeMs(s.board, a.id, s.ctx.now)).toBe(3000);
    s.must({ type: "navigate", direction: "next" });
    s.advance(2000);
    s.must({ type: "navigate", direction: "prev" });
    s.advance(1000);
    s.must({ type: "navigate", direction: "next" });
    expect(s.board.currentTopicId).toBe(b.id);
    expect(s.board.topicStats[a.id]).toEqual({ timeMs: 4000, discussed: true });
    expect(s.board.topicStats[b.id]!.timeMs).toBe(2000);
  });

  it("Next marks the left topic discussed; Prev does not; ends stop the timer", () => {
    const s = newState();
    const a = s.card("a");
    const b = s.card("b");
    toDiscuss(s);
    s.must({ type: "navigate", direction: "next" });
    s.must({ type: "navigate", direction: "prev" });
    expect(s.board.topicStats[b.id]?.discussed).not.toBe(true);
    expect(s.do({ type: "navigate", direction: "prev" }).ok).toBe(false);
    s.must({ type: "navigate", direction: "next" });
    s.must({ type: "navigate", direction: "next" });
    expect(s.board.currentTopicStartedAt).toBeNull();
    expect(s.board.topicStats[b.id]?.discussed).toBe(true);
    expect(a.id).toBeTruthy();
  });

  it("leaving Discuss persists the running time", () => {
    const s = newState();
    const a = s.card("a");
    toDiscuss(s);
    s.advance(7000);
    s.must({ type: "changePhase", phase: "done" });
    expect(s.board.topicStats[a.id]!.timeMs).toBe(7000);
    expect(s.board.currentTopicStartedAt).toBeNull();
  });

  it("navigation is owner-only and Discuss-only", () => {
    const s = newState("start-stop-continue", ["owner", ALICE]);
    s.card("a");
    expect(s.do({ type: "navigate", direction: "next" }).ok).toBe(false);
    toDiscuss(s);
    expect(s.do({ type: "navigate", direction: "next" }, ALICE).ok).toBe(false);
  });
});
