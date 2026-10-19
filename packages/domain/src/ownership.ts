import type { Board, Presence } from "./types";

export type RightsHolder = { kind: "everyone" } | { kind: "session"; sessionId: string };

export const emptyPresence = (): Presence => ({ online: new Set(), temporaryOwnerSessionId: null });

/**
 * Who currently holds owner rights (SPEC §5).
 * - A temporary owner who is online holds them exclusively.
 * - Otherwise the owner holds them when online.
 * - Otherwise everyone does.
 */
export function rightsHolder(board: Board, presence: Presence): RightsHolder {
  const temp = presence.temporaryOwnerSessionId;
  if (temp && presence.online.has(temp)) return { kind: "session", sessionId: temp };
  if (presence.online.has(board.ownerSessionId))
    return { kind: "session", sessionId: board.ownerSessionId };
  return { kind: "everyone" };
}

export function hasOwnerRights(board: Board, presence: Presence, sessionId: string): boolean {
  const holder = rightsHolder(board, presence);
  return holder.kind === "everyone" || holder.sessionId === sessionId;
}

/** The returning owner must choose between taking over and declining (SPEC §5.3). */
export function ownerReturnPromptPending(board: Board, presence: Presence): boolean {
  const temp = presence.temporaryOwnerSessionId;
  return !!temp && presence.online.has(temp) && presence.online.has(board.ownerSessionId);
}

export function connect(presence: Presence, sessionId: string): Presence {
  return { ...presence, online: new Set(presence.online).add(sessionId) };
}

/** A temporary owner who disconnects loses the role; rights open up again (SPEC §5.3). */
export function disconnect(presence: Presence, sessionId: string): Presence {
  const online = new Set(presence.online);
  online.delete(sessionId);
  return {
    online,
    temporaryOwnerSessionId:
      presence.temporaryOwnerSessionId === sessionId ? null : presence.temporaryOwnerSessionId,
  };
}
