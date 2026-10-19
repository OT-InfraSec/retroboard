import { describe, expect, it } from "vitest";
import { joinBoard } from "./board";
import { projectBoard } from "./visibility";
import { ALICE, BOB, newState, OWNER } from "./testing";

const view = (s: ReturnType<typeof newState>, who: string) =>
  projectBoard(s.board, s.state.presence, who, s.ctx.now);
const texts = (s: ReturnType<typeof newState>, who: string) =>
  Object.fromEntries(view(s, who).cards.map((c) => [c.id, c.text]));

describe("visibility", () => {
  it("Write: own cards clear, others blurred without text, owner included", () => {
    const s = newState("start-stop-continue", [OWNER, ALICE, BOB]);
    const a = s.card("alice secret", 0, ALICE);
    const b = s.card("bob secret", 0, BOB);
    expect(texts(s, ALICE)).toEqual({ [a.id]: "alice secret", [b.id]: null });
    expect(texts(s, OWNER)).toEqual({ [a.id]: null, [b.id]: null });
    expect(JSON.stringify(view(s, BOB))).not.toContain("alice secret");
    expect(view(s, BOB).cards.find((c) => c.id === a.id)!.authorName).toBeNull();
  });

  it("Group: owner sees everything; others only own, revealed and group-mates of own", () => {
    const s = newState("start-stop-continue", [OWNER, ALICE, BOB]);
    const a = s.card("a", 0, ALICE);
    const b = s.card("b", 0, BOB);
    const c = s.card("c", 1, BOB);
    const d = s.card("d", 2, BOB);
    s.must({ type: "changePhase", phase: "group" });
    expect(Object.values(texts(s, OWNER))).toEqual(["a", "b", "c", "d"]);
    expect(texts(s, ALICE)).toEqual({ [a.id]: "a", [b.id]: null, [c.id]: null, [d.id]: null });
    s.must({ type: "groupCard", cardId: a.id, targetCardId: b.id });
    s.must({ type: "moveCard", cardId: d.id, columnId: s.cols()[0]! });
    expect(texts(s, ALICE)[b.id]).toBe("b"); // group-mate of her own card
    expect(texts(s, ALICE)[d.id]).toBe("d"); // moved → revealed
    expect(texts(s, ALICE)[c.id]).toBeNull();
  });

  it("Group: everyone sees everything while rights are open (owner offline)", () => {
    const s = newState("start-stop-continue", [ALICE, BOB]);
    const a = s.card("a", 0, ALICE);
    s.must({ type: "changePhase", phase: "group" }, ALICE);
    expect(texts(s, BOB)[a.id]).toBeNull(); // temporary owner exists → normal view
    s.state = { ...s.state, presence: { ...s.state.presence, temporaryOwnerSessionId: null } };
    expect(texts(s, BOB)[a.id]).toBe("a");
  });

  it("Discuss: only the current topic is sent, in clear text", () => {
    const s = newState("start-stop-continue", [OWNER, ALICE]);
    const [a, b] = [s.card("first", 0, ALICE), s.card("second", 0, ALICE)];
    s.must({ type: "changePhase", phase: "discuss" });
    let v = view(s, ALICE);
    expect(v.cards.map((c) => c.id)).toEqual([a.id]);
    expect(JSON.stringify(v)).not.toContain("second");
    expect(v.discussion).toMatchObject({ index: 0, count: 2, running: true });
    s.must({ type: "navigate", direction: "next" });
    v = view(s, ALICE);
    expect(v.cards.map((c) => c.id)).toEqual([b.id]);
  });

  it("Done: full board unblurred for everyone", () => {
    const s = newState("start-stop-continue", [OWNER, ALICE, BOB]);
    s.card("a", 0, ALICE);
    s.card("b", 1, BOB);
    s.must({ type: "changePhase", phase: "done" });
    expect(Object.values(texts(s, ALICE))).toEqual(["a", "b"]);
  });

  it("never exposes session ids and marks participants and viewer", () => {
    const s = newState("start-stop-continue", [OWNER, ALICE]);
    const ids = { n: 0 };
    const jctx = { now: 1, newId: () => `pub${++ids.n}` };
    s.state = {
      ...s.state,
      board: joinBoard(joinBoard(s.board, OWNER, "Olga", jctx), ALICE, "Al", jctx),
    };
    s.card("x", 0, ALICE);
    const v = view(s, ALICE);
    expect(JSON.stringify(v)).not.toContain(`"${OWNER}"`);
    expect(v.participants).toMatchObject([
      { name: "Olga", isOwner: true, online: true, isYou: false },
      { name: "Al", isOwner: false, isYou: true },
    ]);
    expect(v.viewer).toMatchObject({ hasOwnerRights: false, isOwner: false });
  });

  it("owner return prompt is shown to the returning owner only", () => {
    const s = newState("start-stop-continue", [ALICE]);
    s.must({ type: "changePhase", phase: "group" }, ALICE);
    s.online(OWNER);
    expect(view(s, OWNER).viewer.ownerReturnPrompt).toBe(true);
    expect(view(s, ALICE).viewer.ownerReturnPrompt).toBe(false);
  });
});
