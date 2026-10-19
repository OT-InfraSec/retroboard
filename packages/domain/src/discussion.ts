import type { Board, Card } from "./types";

export const topicIdOf = (card: Card): string => card.groupId ?? card.id;

export interface Topic {
  id: string;
  columnId: string;
  cards: Card[];
}

export function topicsOf(board: Board): Topic[] {
  const byId = new Map<string, Topic>();
  for (const card of board.cards) {
    const id = topicIdOf(card);
    const topic = byId.get(id);
    if (topic) topic.cards.push(card);
    else byId.set(id, { id, columnId: card.columnId, cards: [card] });
  }
  return [...byId.values()];
}

const earliest = (t: Topic): Card => t.cards.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));

/** Columns left to right, then by (earliest) creation time (SPEC §6.3). */
export function computeDiscussionOrder(board: Board): string[] {
  const topics = topicsOf(board);
  const order: string[] = [];
  for (const column of board.columns) {
    topics
      .filter((t) => t.columnId === column.id)
      .sort((a, b) => {
        const ca = earliest(a);
        const cb = earliest(b);
        return ca.createdAt - cb.createdAt || ca.id.localeCompare(cb.id);
      })
      .forEach((t) => order.push(t.id));
  }
  return order;
}

/** Accumulated time plus the running segment of the current topic. */
export function topicTimeMs(board: Board, topicId: string, now: number): number {
  const saved = board.topicStats[topicId]?.timeMs ?? 0;
  const running =
    board.currentTopicId === topicId && board.currentTopicStartedAt !== null
      ? now - board.currentTopicStartedAt
      : 0;
  return saved + running;
}

export function stopTimer(board: Board, now: number): Board {
  const { currentTopicId: id, currentTopicStartedAt: started } = board;
  if (!id || started === null) return board;
  const stats = board.topicStats[id] ?? { timeMs: 0, discussed: false };
  return {
    ...board,
    currentTopicStartedAt: null,
    topicStats: { ...board.topicStats, [id]: { ...stats, timeMs: stats.timeMs + (now - started) } },
  };
}

export function enterDiscuss(board: Board, now: number): Board {
  const order = computeDiscussionOrder(board);
  const current = order[0] ?? null;
  return {
    ...board,
    discussionOrder: order,
    currentTopicId: current,
    currentTopicStartedAt: current ? now : null,
  };
}

export function leaveDiscuss(board: Board, now: number): Board {
  return { ...stopTimer(board, now), currentTopicId: null };
}
