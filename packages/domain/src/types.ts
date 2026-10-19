export type Phase = "write" | "group" | "discuss" | "done";
export const PHASES: readonly Phase[] = ["write", "group", "discuss", "done"];

export const MAX_CARD_LENGTH = 500;
export const READ_ONLY_AFTER_MS = 24 * 60 * 60 * 1000;

export interface Column {
  id: string;
  name: string;
}

export interface Card {
  id: string;
  columnId: string;
  text: string;
  authorName: string;
  authorSessionId: string;
  createdAt: number;
  /** Cards sharing a groupId form a group; a lone card never keeps a groupId. */
  groupId: string | null;
  /** Set when the owner grouped or moved the card; reveals it to everyone. */
  revealed: boolean;
}

export interface TopicStats {
  timeMs: number;
  discussed: boolean;
}

export interface Issue {
  id: string;
  topicId: string;
  number: number;
  url: string;
  title: string;
}

export interface Participant {
  sessionId: string;
  /** Opaque id that is safe to show to other participants. */
  publicId: string;
  name: string;
}

export interface Board {
  id: string;
  teamId: string;
  name: string;
  templateId: string;
  ownerSessionId: string;
  phase: Phase;
  /** Manual read-only flag. Auto read-only is derived from lastChangeAt. */
  readOnly: boolean;
  createdAt: number;
  lastChangeAt: number;
  columns: Column[];
  cards: Card[];
  participants: Participant[];
  /** Topic ids (groupId, or cardId for ungrouped cards) in discussion order. */
  discussionOrder: string[];
  currentTopicId: string | null;
  /** When the current topic's timer was started; null if stopped. */
  currentTopicStartedAt: number | null;
  /** Keyed by topic id. Kept across Discuss re-entries. */
  topicStats: Record<string, TopicStats>;
  issues: Issue[];
}

/** Ephemeral, in-memory connection state (ADR-003). */
export interface Presence {
  online: ReadonlySet<string>;
  temporaryOwnerSessionId: string | null;
}

export interface Ctx {
  now: number;
  newId: () => string;
}

export type ErrorCode = "forbidden" | "read_only" | "wrong_phase" | "invalid" | "not_found";

export interface DomainError {
  code: ErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: DomainError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = (code: ErrorCode, message: string): Result<never> => ({
  ok: false,
  error: { code, message },
});
