import { columnTone } from "@retroboard/domain";

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Shortened issue title for display on cards. */
export const shorten = (s: string, max = 28) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Pastel tone class for a column (template colour by name, else by position). */
export const toneClass = (name: string, columnIndex: number) =>
  `tone-${columnTone(name, columnIndex)}`;
