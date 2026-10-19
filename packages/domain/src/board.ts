import { fail, ok, READ_ONLY_AFTER_MS, type Board, type Ctx, type Result } from "./types";
import { findTemplate } from "./templates";

export interface CreateBoardInput {
  teamId: string;
  templateId: string;
  name: string;
  ownerSessionId: string;
}

export function defaultBoardName(team: string, date: Date): string {
  return `${team} Retro – ${date.toISOString().slice(0, 10)}`;
}

export function createBoard(input: CreateBoardInput, ctx: Ctx): Result<Board> {
  const template = findTemplate(input.templateId);
  if (!template) return fail("invalid", "Unknown template");
  const name = input.name.trim();
  if (!name) return fail("invalid", "Board name is required");
  if (!input.teamId) return fail("invalid", "Team is required");
  return ok({
    id: ctx.newId(),
    teamId: input.teamId,
    name,
    templateId: template.id,
    ownerSessionId: input.ownerSessionId,
    phase: "write",
    readOnly: false,
    createdAt: ctx.now,
    lastChangeAt: ctx.now,
    columns: template.columns.map((n) => ({ id: ctx.newId(), name: n })),
    cards: [],
    participants: [],
    discussionOrder: [],
    currentTopicId: null,
    currentTopicStartedAt: null,
    topicStats: {},
    issues: [],
  });
}

/** Read-only is manual or automatic 24h after the last change (SPEC §7). */
export function isReadOnly(board: Board, now: number, afterMs = READ_ONLY_AFTER_MS): boolean {
  return board.readOnly || now - board.lastChangeAt >= afterMs;
}

/** Registers a participant (not a change; viewing is not activity). Updates the name if known. */
export function joinBoard(board: Board, sessionId: string, name: string, ctx: Ctx): Board {
  const existing = board.participants.find((p) => p.sessionId === sessionId);
  if (existing) {
    if (existing.name === name) return board;
    return {
      ...board,
      participants: board.participants.map((p) => (p === existing ? { ...p, name } : p)),
    };
  }
  return {
    ...board,
    participants: [...board.participants, { sessionId, publicId: ctx.newId(), name }],
  };
}
