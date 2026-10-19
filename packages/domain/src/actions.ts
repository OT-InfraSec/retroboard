import { isReadOnly } from "./board";
import { hasOwnerRights, ownerReturnPromptPending } from "./ownership";
import { enterDiscuss, leaveDiscuss, stopTimer, topicIdOf } from "./discussion";
import {
  fail,
  MAX_CARD_LENGTH,
  ok,
  PHASES,
  type Board,
  type Card,
  type Ctx,
  type Phase,
  type Presence,
  type Result,
} from "./types";

export interface State {
  board: Board;
  presence: Presence;
}

export type Action =
  | { type: "changePhase"; phase: Phase }
  | { type: "setReadOnly"; readOnly: boolean }
  | { type: "renameBoard"; name: string }
  | { type: "addColumn"; name: string }
  | { type: "renameColumn"; columnId: string; name: string }
  | { type: "removeColumn"; columnId: string }
  | { type: "moveColumn"; columnId: string; direction: "left" | "right" }
  | { type: "createCard"; columnId: string; text: string; authorName: string }
  | { type: "editCard"; cardId: string; text: string }
  | { type: "deleteCard"; cardId: string }
  | { type: "groupCard"; cardId: string; targetCardId: string }
  | { type: "ungroupCard"; cardId: string }
  | { type: "moveCard"; cardId: string; columnId: string }
  | { type: "navigate"; direction: "next" | "prev" }
  | { type: "addIssue"; topicId: string; number: number; url: string; title: string }
  | { type: "resolveOwnerReturn"; choice: "takeOver" | "decline" };

const OWNER_ONLY: ReadonlySet<Action["type"]> = new Set([
  "changePhase",
  "setReadOnly",
  "renameBoard",
  "addColumn",
  "renameColumn",
  "removeColumn",
  "moveColumn",
  "groupCard",
  "ungroupCard",
  "moveCard",
  "navigate",
]);

export const validateCardText = (text: string): Result<string> => {
  const trimmed = text.trim();
  if (!trimmed) return fail("invalid", "Card text must not be empty");
  if (trimmed.length > MAX_CARD_LENGTH)
    return fail("invalid", `Card text must be at most ${MAX_CARD_LENGTH} characters`);
  return ok(trimmed);
};

const validateName = (name: string, what: string): Result<string> => {
  const trimmed = name.trim();
  if (!trimmed) return fail("invalid", `${what} must not be empty`);
  if (trimmed.length > 100) return fail("invalid", `${what} is too long`);
  return ok(trimmed);
};

/** Removes the groupId of any group that has been reduced to a single card. */
function dropSingletonGroups(cards: Card[]): Card[] {
  const counts = new Map<string, number>();
  for (const c of cards) if (c.groupId) counts.set(c.groupId, (counts.get(c.groupId) ?? 0) + 1);
  return cards.map((c) => (c.groupId && counts.get(c.groupId)! < 2 ? { ...c, groupId: null } : c));
}

const withBoard = (state: State, board: Board, ctx: Ctx): Result<State> =>
  ok({ ...state, board: { ...board, lastChangeAt: ctx.now } });

/**
 * The single entry point for board mutations. Validates phase, ownership,
 * authorship and read-only state (SPEC §10) and returns the new state.
 */
export function applyAction(state: State, action: Action, actor: string, ctx: Ctx): Result<State> {
  const { board, presence } = state;

  if (action.type === "resolveOwnerReturn") return resolveOwnerReturn(state, action.choice, actor);

  if (OWNER_ONLY.has(action.type) && !hasOwnerRights(board, presence, actor))
    return fail("forbidden", "Only the owner can do this");

  const readOnly = isReadOnly(board, ctx.now);
  if (action.type === "setReadOnly") {
    if (action.readOnly) {
      if (readOnly) return fail("read_only", "Board is already read-only");
      return withBoard(state, { ...stopTimer(board, ctx.now), readOnly: true }, ctx);
    }
    if (!readOnly) return fail("invalid", "Board is not read-only");
    return withBoard(state, { ...board, readOnly: false }, ctx);
  }
  if (readOnly) return fail("read_only", "Board is read-only");

  switch (action.type) {
    case "changePhase": {
      if (!PHASES.includes(action.phase)) return fail("invalid", "Unknown phase");
      if (action.phase === board.phase) return fail("invalid", "Board is already in this phase");
      let next = board.phase === "discuss" ? leaveDiscuss(board, ctx.now) : board;
      if (action.phase === "discuss") next = enterDiscuss(next, ctx.now);
      next = { ...next, phase: action.phase };
      const becomesTemporary =
        (action.phase === "group" || action.phase === "discuss") &&
        !presence.online.has(board.ownerSessionId) &&
        presence.temporaryOwnerSessionId === null;
      const res = withBoard(state, next, ctx);
      if (res.ok && becomesTemporary)
        res.value.presence = { ...presence, temporaryOwnerSessionId: actor };
      return res;
    }

    case "renameBoard": {
      const name = validateName(action.name, "Board name");
      if (!name.ok) return name;
      return withBoard(state, { ...board, name: name.value }, ctx);
    }

    case "addColumn": {
      const name = validateName(action.name, "Column name");
      if (!name.ok) return name;
      return withBoard(
        state,
        { ...board, columns: [...board.columns, { id: ctx.newId(), name: name.value }] },
        ctx,
      );
    }

    case "renameColumn": {
      const name = validateName(action.name, "Column name");
      if (!name.ok) return name;
      if (!board.columns.some((c) => c.id === action.columnId))
        return fail("not_found", "Column not found");
      const columns = board.columns.map((c) =>
        c.id === action.columnId ? { ...c, name: name.value } : c,
      );
      return withBoard(state, { ...board, columns }, ctx);
    }

    case "removeColumn": {
      const idx = board.columns.findIndex((c) => c.id === action.columnId);
      if (idx < 0) return fail("not_found", "Column not found");
      if (board.columns.length <= 1) return fail("invalid", "At least one column must remain");
      const target = board.columns[idx + 1] ?? board.columns[idx - 1]!;
      return withBoard(
        state,
        {
          ...board,
          columns: board.columns.filter((c) => c.id !== action.columnId),
          cards: board.cards.map((c) =>
            c.columnId === action.columnId ? { ...c, columnId: target.id } : c,
          ),
        },
        ctx,
      );
    }

    case "moveColumn": {
      const idx = board.columns.findIndex((c) => c.id === action.columnId);
      if (idx < 0) return fail("not_found", "Column not found");
      const to = action.direction === "left" ? idx - 1 : idx + 1;
      if (to < 0 || to >= board.columns.length) return fail("invalid", "Cannot move further");
      const columns = [...board.columns];
      [columns[idx], columns[to]] = [columns[to]!, columns[idx]!];
      return withBoard(state, { ...board, columns }, ctx);
    }

    case "createCard": {
      const text = validateCardText(action.text);
      if (!text.ok) return text;
      const authorName = validateName(action.authorName, "Display name");
      if (!authorName.ok) return authorName;
      if (!board.columns.some((c) => c.id === action.columnId))
        return fail("not_found", "Column not found");
      const card: Card = {
        id: ctx.newId(),
        columnId: action.columnId,
        text: text.value,
        authorName: authorName.value,
        authorSessionId: actor,
        createdAt: ctx.now,
        groupId: null,
        revealed: false,
      };
      let next: Board = { ...board, cards: [...board.cards, card] };
      if (board.phase === "discuss") {
        // Cards created during Discuss are appended to the end of the order.
        next = { ...next, discussionOrder: [...board.discussionOrder, card.id] };
        if (!next.currentTopicId)
          next = { ...next, currentTopicId: card.id, currentTopicStartedAt: ctx.now };
      }
      return withBoard(state, next, ctx);
    }

    case "editCard":
    case "deleteCard": {
      if (board.phase === "discuss")
        return fail("wrong_phase", "Cards cannot be changed during Discuss");
      const card = board.cards.find((c) => c.id === action.cardId);
      if (!card) return fail("not_found", "Card not found");
      if (card.authorSessionId !== actor) return fail("forbidden", "Only the author can do this");
      if (action.type === "editCard") {
        const text = validateCardText(action.text);
        if (!text.ok) return text;
        return withBoard(
          state,
          {
            ...board,
            cards: board.cards.map((c) => (c === card ? { ...c, text: text.value } : c)),
          },
          ctx,
        );
      }
      return withBoard(
        state,
        { ...board, cards: dropSingletonGroups(board.cards.filter((c) => c !== card)) },
        ctx,
      );
    }

    case "groupCard": {
      if (board.phase !== "group") return fail("wrong_phase", "Grouping is only possible in Group");
      const card = board.cards.find((c) => c.id === action.cardId);
      const target = board.cards.find((c) => c.id === action.targetCardId);
      if (!card || !target) return fail("not_found", "Card not found");
      if (card.id === target.id) return fail("invalid", "Cannot group a card with itself");
      if (card.columnId !== target.columnId)
        return fail("invalid", "Cards must be in the same column");
      const groupId = target.groupId ?? ctx.newId();
      if (card.groupId === groupId) return fail("invalid", "Already in this group");
      const cards = board.cards.map((c) =>
        c.id === card.id || c.id === target.id || c.groupId === groupId
          ? { ...c, groupId, revealed: true }
          : c,
      );
      return withBoard(state, { ...board, cards: dropSingletonGroups(cards) }, ctx);
    }

    case "ungroupCard": {
      if (board.phase !== "group")
        return fail("wrong_phase", "Ungrouping is only possible in Group");
      const card = board.cards.find((c) => c.id === action.cardId);
      if (!card) return fail("not_found", "Card not found");
      if (!card.groupId) return fail("invalid", "Card is not grouped");
      const cards = board.cards.map((c) => (c === card ? { ...c, groupId: null } : c));
      return withBoard(state, { ...board, cards: dropSingletonGroups(cards) }, ctx);
    }

    case "moveCard": {
      if (board.phase !== "group") return fail("wrong_phase", "Moving is only possible in Group");
      const card = board.cards.find((c) => c.id === action.cardId);
      if (!card) return fail("not_found", "Card not found");
      if (!board.columns.some((c) => c.id === action.columnId))
        return fail("not_found", "Column not found");
      const topic = topicIdOf(card);
      const cards = board.cards.map((c) =>
        topicIdOf(c) === topic ? { ...c, columnId: action.columnId, revealed: true } : c,
      );
      return withBoard(state, { ...board, cards }, ctx);
    }

    case "navigate": {
      if (board.phase !== "discuss") return fail("wrong_phase", "Navigation is only for Discuss");
      const cur = board.currentTopicId;
      const idx = cur ? board.discussionOrder.indexOf(cur) : -1;
      if (idx < 0) return fail("invalid", "No current topic");
      let next = stopTimer(board, ctx.now);
      if (action.direction === "prev") {
        if (idx === 0) return fail("invalid", "Already at the first topic");
        next = {
          ...next,
          currentTopicId: board.discussionOrder[idx - 1]!,
          currentTopicStartedAt: ctx.now,
        };
      } else {
        const stats = next.topicStats[cur!] ?? { timeMs: 0, discussed: false };
        next = {
          ...next,
          topicStats: { ...next.topicStats, [cur!]: { ...stats, discussed: true } },
        };
        const following = board.discussionOrder[idx + 1];
        if (following)
          next = { ...next, currentTopicId: following, currentTopicStartedAt: ctx.now };
      }
      return withBoard(state, next, ctx);
    }

    case "addIssue": {
      if (board.phase !== "discuss") return fail("wrong_phase", "Issues are created in Discuss");
      if (!board.discussionOrder.includes(action.topicId))
        return fail("not_found", "Topic not found");
      const issue = {
        id: ctx.newId(),
        topicId: action.topicId,
        number: action.number,
        url: action.url,
        title: action.title,
      };
      return withBoard(state, { ...board, issues: [...board.issues, issue] }, ctx);
    }
  }
}

function resolveOwnerReturn(
  state: State,
  choice: "takeOver" | "decline",
  actor: string,
): Result<State> {
  const { board, presence } = state;
  if (actor !== board.ownerSessionId) return fail("forbidden", "Only the owner can decide");
  const temp = presence.temporaryOwnerSessionId;
  if (!temp || !ownerReturnPromptPending(board, presence))
    return fail("invalid", "No temporary owner to resolve");
  const cleared = { ...presence, temporaryOwnerSessionId: null };
  return ok({
    board: choice === "decline" ? { ...board, ownerSessionId: temp } : board,
    presence: cleared,
  });
}
