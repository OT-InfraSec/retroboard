import { hasOwnerRights, ownerReturnPromptPending } from "./ownership";
import { isReadOnly } from "./board";
import { topicIdOf, topicTimeMs } from "./discussion";
import type { Board, Card, Column, Issue, Phase, Presence } from "./types";

export interface CardView {
  id: string;
  columnId: string;
  /** null when the viewer may not read the card (blurred). Never sent to the client then. */
  text: string | null;
  authorName: string | null;
  mine: boolean;
  groupId: string | null;
  createdAt: number;
}

export interface ParticipantView {
  publicId: string;
  name: string;
  online: boolean;
  isOwner: boolean;
  isTemporaryOwner: boolean;
  isYou: boolean;
}

export interface BoardView {
  id: string;
  teamId: string;
  name: string;
  phase: Phase;
  readOnly: boolean;
  columns: Column[];
  /** Phase Discuss: only the current topic's cards. Otherwise all cards (some blurred). */
  cards: CardView[];
  issues: Issue[];
  participants: ParticipantView[];
  viewer: {
    hasOwnerRights: boolean;
    isOwner: boolean;
    isTemporaryOwner: boolean;
    /** The returning owner has to choose between taking over and declining. */
    ownerReturnPrompt: boolean;
  };
  discussion: null | {
    currentTopicId: string | null;
    index: number;
    count: number;
    timeMs: number;
    running: boolean;
    discussed: boolean;
    discussedTopicIds: string[];
  };
}

function canRead(board: Board, card: Card, viewer: string, rights: boolean): boolean {
  switch (board.phase) {
    case "done":
    case "discuss":
      return true;
    case "write":
      return card.authorSessionId === viewer;
    case "group":
      if (rights || card.authorSessionId === viewer || card.revealed) return true;
      // Group-mates of the viewer's own card are revealed to them.
      return (
        card.groupId !== null &&
        board.cards.some((c) => c.groupId === card.groupId && c.authorSessionId === viewer)
      );
  }
}

/** Server-side visibility (SPEC §6, §10): hidden text is removed, not just styled. */
export function projectBoard(
  board: Board,
  presence: Presence,
  viewer: string,
  now: number,
): BoardView {
  const rights = hasOwnerRights(board, presence, viewer);
  const visible =
    board.phase === "discuss"
      ? board.cards.filter((c) => topicIdOf(c) === board.currentTopicId)
      : board.cards;

  const cards: CardView[] = visible.map((c) => {
    const readable = canRead(board, c, viewer, rights);
    return {
      id: c.id,
      columnId: c.columnId,
      text: readable ? c.text : null,
      authorName: readable ? c.authorName : null,
      mine: c.authorSessionId === viewer,
      groupId: c.groupId,
      createdAt: c.createdAt,
    };
  });

  const temp = presence.temporaryOwnerSessionId;
  const cur = board.currentTopicId;
  const discussion =
    board.phase === "discuss"
      ? {
          currentTopicId: cur,
          index: cur ? board.discussionOrder.indexOf(cur) : -1,
          count: board.discussionOrder.length,
          timeMs: cur ? topicTimeMs(board, cur, now) : 0,
          running: board.currentTopicStartedAt !== null,
          discussed: cur ? (board.topicStats[cur]?.discussed ?? false) : false,
          discussedTopicIds: board.discussionOrder.filter((id) => board.topicStats[id]?.discussed),
        }
      : null;

  return {
    id: board.id,
    teamId: board.teamId,
    name: board.name,
    phase: board.phase,
    readOnly: isReadOnly(board, now),
    columns: board.columns,
    cards,
    issues:
      board.phase === "discuss" ? board.issues.filter((i) => i.topicId === cur) : board.issues,
    participants: board.participants.map((p) => ({
      publicId: p.publicId,
      name: p.name,
      online: presence.online.has(p.sessionId),
      isOwner: p.sessionId === board.ownerSessionId,
      isTemporaryOwner: temp === p.sessionId,
      isYou: p.sessionId === viewer,
    })),
    viewer: {
      hasOwnerRights: rights,
      isOwner: viewer === board.ownerSessionId,
      isTemporaryOwner: temp === viewer,
      ownerReturnPrompt:
        viewer === board.ownerSessionId && ownerReturnPromptPending(board, presence),
    },
    discussion,
  };
}
