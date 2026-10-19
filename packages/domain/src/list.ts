export interface BoardSummary {
  id: string;
  name: string;
  teamId: string;
  createdAt: number;
  lastChangeAt: number;
}

const dayOf = (ms: number) => Math.floor(ms / 86_400_000);

/** Newest creation day first; within a day, most recent change first (SPEC §4.1). */
export function sortBoards<T extends BoardSummary>(boards: readonly T[]): T[] {
  return [...boards].sort(
    (a, b) =>
      dayOf(b.createdAt) - dayOf(a.createdAt) ||
      b.lastChangeAt - a.lastChangeAt ||
      b.createdAt - a.createdAt,
  );
}

export function searchBoards<T extends BoardSummary>(boards: readonly T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? boards.filter((b) => b.name.toLowerCase().includes(q)) : [...boards];
}
