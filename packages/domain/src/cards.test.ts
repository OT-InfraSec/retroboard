import { describe, expect, it } from "vitest";
import { ALICE, BOB, newState, OWNER } from "./testing";

describe("cards", () => {
  it("creates cards with trimmed text and author snapshot; rejects empty/too long", () => {
    const s = newState();
    const c = s.card("  hello ");
    expect(c.text).toBe("hello");
    expect(c.authorSessionId).toBe(ALICE);
    const col = s.cols()[0]!;
    expect(s.do({ type: "createCard", columnId: col, text: "  ", authorName: "a" }, ALICE).ok).toBe(
      false,
    );
    expect(
      s.do({ type: "createCard", columnId: col, text: "x".repeat(501), authorName: "a" }, ALICE).ok,
    ).toBe(false);
    expect(
      s.do({ type: "createCard", columnId: col, text: "x".repeat(500), authorName: "a" }, ALICE).ok,
    ).toBe(true);
  });

  it("only the author may edit/delete, in Write, Group and Done", () => {
    const s = newState();
    const c = s.card("mine");
    expect(s.do({ type: "editCard", cardId: c.id, text: "x" }, BOB).ok).toBe(false);
    expect(s.do({ type: "deleteCard", cardId: c.id }, OWNER).ok).toBe(false); // owner has no power over others' cards
    for (const phase of ["group", "done", "write"] as const) {
      s.must({ type: "changePhase", phase });
      expect(s.do({ type: "editCard", cardId: c.id, text: phase }, ALICE).ok).toBe(true);
    }
    s.must({ type: "changePhase", phase: "discuss" });
    expect(s.do({ type: "editCard", cardId: c.id, text: "x" }, ALICE).ok).toBe(false);
    expect(s.do({ type: "deleteCard", cardId: c.id }, ALICE).ok).toBe(false);
  });

  it("deleting a card from a two-card group dissolves the group", () => {
    const s = newState();
    const a = s.card("a");
    const b = s.card("b");
    s.must({ type: "changePhase", phase: "group" });
    s.must({ type: "groupCard", cardId: a.id, targetCardId: b.id });
    s.must({ type: "deleteCard", cardId: a.id }, ALICE);
    expect(s.board.cards.map((c) => c.groupId)).toEqual([null]);
  });
});

describe("board editing & grouping", () => {
  it("removing a column moves cards right, or left for the last column; keeps one", () => {
    const s = newState();
    const [c0, c1, c2] = s.cols() as [string, string, string];
    const a = s.card("a", 0);
    const z = s.card("z", 2);
    s.must({ type: "removeColumn", columnId: c0 });
    expect(s.board.cards.find((c) => c.id === a.id)!.columnId).toBe(c1);
    s.must({ type: "removeColumn", columnId: c2 });
    expect(s.board.cards.find((c) => c.id === z.id)!.columnId).toBe(c1);
    expect(s.do({ type: "removeColumn", columnId: c1 }).ok).toBe(false);
  });

  it("adds, renames and reorders columns", () => {
    const s = newState();
    const [c0, c1] = s.cols() as [string, string];
    s.must({ type: "addColumn", name: "New" });
    s.must({ type: "renameColumn", columnId: c0, name: "Begin" });
    s.must({ type: "moveColumn", columnId: c0, direction: "right" });
    expect(s.board.columns.map((c) => c.name)).toEqual(["Stop", "Begin", "Continue", "New"]);
    expect(s.board.columns[0]!.id).toBe(c1);
    expect(s.do({ type: "moveColumn", columnId: c1, direction: "left" }).ok).toBe(false);
  });

  it("groups cards in the same column, reveals them, joins existing groups", () => {
    const s = newState();
    const a = s.card("a");
    const b = s.card("b");
    const c = s.card("c");
    const other = s.card("o", 1);
    s.must({ type: "changePhase", phase: "group" });
    expect(s.do({ type: "groupCard", cardId: a.id, targetCardId: other.id }).ok).toBe(false);
    expect(s.do({ type: "groupCard", cardId: a.id, targetCardId: b.id }, ALICE).ok).toBe(false);
    s.must({ type: "groupCard", cardId: a.id, targetCardId: b.id });
    s.must({ type: "groupCard", cardId: c.id, targetCardId: a.id });
    const groups = new Set(s.board.cards.filter((x) => x.groupId).map((x) => x.groupId));
    expect(groups.size).toBe(1);
    expect(s.board.cards.filter((x) => x.revealed)).toHaveLength(3);
  });

  it("unlink removes a card; a group of two dissolves", () => {
    const s = newState();
    const [a, b, c] = [s.card("a"), s.card("b"), s.card("c")];
    s.must({ type: "changePhase", phase: "group" });
    s.must({ type: "groupCard", cardId: a.id, targetCardId: b.id });
    s.must({ type: "groupCard", cardId: c.id, targetCardId: b.id });
    s.must({ type: "ungroupCard", cardId: a.id });
    expect(s.board.cards.filter((x) => x.groupId)).toHaveLength(2);
    s.must({ type: "ungroupCard", cardId: b.id });
    expect(s.board.cards.every((x) => x.groupId === null)).toBe(true);
  });

  it("moving a grouped card moves the whole group and reveals it", () => {
    const s = newState();
    const [a, b] = [s.card("a"), s.card("b")];
    s.must({ type: "changePhase", phase: "group" });
    s.must({ type: "groupCard", cardId: a.id, targetCardId: b.id });
    s.must({ type: "moveCard", cardId: a.id, columnId: s.cols()[2]! });
    expect(s.board.cards.every((x) => x.columnId === s.cols()[2])).toBe(true);
  });

  it("grouping is Group-phase and owner only", () => {
    const s = newState("start-stop-continue", [OWNER, ALICE]);
    const [a, b] = [s.card("a"), s.card("b")];
    expect(s.do({ type: "groupCard", cardId: a.id, targetCardId: b.id }).ok).toBe(false);
    s.must({ type: "changePhase", phase: "group" });
    expect(s.do({ type: "groupCard", cardId: a.id, targetCardId: b.id }, ALICE).ok).toBe(false);
  });
});
