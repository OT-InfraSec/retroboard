import { describe, expect, it } from "vitest";
import { composeIssue, deepLink, defaultIssueTitle } from "./issues";
import { searchBoards, sortBoards } from "./list";
import { createBoard, defaultBoardName } from "./board";
import { TEMPLATES, columnTone } from "./templates";
import { ALICE, newState } from "./testing";

const DAY = 86_400_000;

describe("board list", () => {
  const b = (id: string, name: string, createdAt: number, lastChangeAt = createdAt) => ({
    id,
    name,
    teamId: "A",
    createdAt,
    lastChangeAt,
  });

  it("sorts by creation day desc, then last change desc", () => {
    const sorted = sortBoards([
      b("old", "o", 1 * DAY + 100, 9 * DAY),
      b("a", "a", 5 * DAY + 100, 5 * DAY + 200),
      b("b", "b", 5 * DAY + 50, 5 * DAY + 900),
      b("c", "c", 5 * DAY + 10),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["b", "a", "c", "old"]);
  });

  it("searches names case-insensitively by substring", () => {
    const all = [b("1", "Alpha Retro", 1), b("2", "beta retro", 2), b("3", "Gamma", 3)];
    expect(searchBoards(all, " RETRO ").map((x) => x.id)).toEqual(["1", "2"]);
    expect(searchBoards(all, "")).toHaveLength(3);
  });
});

describe("issues", () => {
  it("default title: first sentence, ~50 chars, ellipsis if cut", () => {
    expect(defaultIssueTitle("Deploys are slow. We should fix it.")).toBe("Deploys are slow.");
    expect(defaultIssueTitle("short")).toBe("short");
    const long = "x".repeat(80);
    expect(defaultIssueTitle(long)).toBe(`${"x".repeat(50)}…`);
    expect(defaultIssueTitle("line one\nline two")).toBe("line one");
  });

  it("builds deep links", () => {
    expect(deepLink("https://r.example/", "b1", "t 1")).toBe(
      "https://r.example/boards/b1?topic=t%201",
    );
  });

  it("composes body: cards, description, deep link; retro label; group uses earliest card for title", () => {
    const s = newState();
    const a = s.card("Earliest card. More.");
    const b = s.card("Second");
    const issue = composeIssue({ cards: [b, a], description: "Extra context", link: "https://l" });
    expect(issue.title).toBe("Earliest card.");
    expect(issue.body).toBe(
      "- Earliest card. More.\n- Second\n\nExtra context\n\n[Open this topic in Retroboard](https://l)",
    );
    expect(issue.labels).toEqual(["retro"]);
    const single = composeIssue({ cards: [a], title: " Mine ", link: "https://l" });
    expect(single.title).toBe("Mine");
    expect(single.body).toBe("Earliest card. More.\n\n[Open this topic in Retroboard](https://l)");
    expect(ALICE).toBeTruthy();
  });
});

describe("board creation", () => {
  it("every template yields its columns; owner and write phase set", () => {
    for (const t of TEMPLATES) {
      const r = createBoard(
        { teamId: "A", templateId: t.id, name: "n", ownerSessionId: "o" },
        {
          now: 1,
          newId: (() => {
            let i = 0;
            return () => `i${++i}`;
          })(),
        },
      );
      expect(r.ok && r.value.columns.map((c) => c.name)).toEqual(t.columns);
      expect(r.ok && r.value.phase).toBe("write");
    }
  });

  it("every template column has a tone; tones follow names, else position", () => {
    for (const t of TEMPLATES) expect(t.tones).toHaveLength(t.columns.length);
    expect(columnTone("Start", 2)).toBe("green");
    expect(columnTone(" stop ", 0)).toBe("red");
    expect(columnTone("Custom", 0)).toBe("red");
    expect(columnTone("Custom", 7)).toBe("green");
  });

  it("rejects unknown template / empty name; default name format", () => {
    const ctx = { now: 1, newId: () => "x" };
    expect(
      createBoard({ teamId: "A", templateId: "nope", name: "n", ownerSessionId: "o" }, ctx).ok,
    ).toBe(false);
    expect(
      createBoard({ teamId: "A", templateId: "4ls", name: " ", ownerSessionId: "o" }, ctx).ok,
    ).toBe(false);
    expect(defaultBoardName("Alpha", new Date("2026-10-20T10:00:00Z"))).toBe(
      "Alpha Retro – 2026-10-20",
    );
  });
});

describe("issues in Discuss", () => {
  it("stores issues on a topic, multiple allowed, only in Discuss", () => {
    const s = newState();
    const a = s.card("a");
    const add = () => s.do({ type: "addIssue", topicId: a.id, number: 1, url: "u", title: "t" });
    expect(add().ok).toBe(false);
    s.must({ type: "changePhase", phase: "discuss" });
    expect(add().ok).toBe(true);
    expect(add().ok).toBe(true);
    expect(s.board.issues).toHaveLength(2);
    expect(s.do({ type: "addIssue", topicId: "zzz", number: 1, url: "u", title: "t" }).ok).toBe(
      false,
    );
  });
});
