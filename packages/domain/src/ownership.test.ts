import { describe, expect, it } from "vitest";
import { hasOwnerRights, ownerReturnPromptPending, rightsHolder, disconnect } from "./ownership";
import { ALICE, BOB, newState, OWNER } from "./testing";

describe("ownership", () => {
  it("owner online holds exclusive rights", () => {
    const s = newState("start-stop-continue", [OWNER, ALICE]);
    expect(hasOwnerRights(s.board, s.state.presence, OWNER)).toBe(true);
    expect(hasOwnerRights(s.board, s.state.presence, ALICE)).toBe(false);
  });

  it("owner offline → everyone has rights", () => {
    const s = newState("start-stop-continue", [ALICE]);
    expect(rightsHolder(s.board, s.state.presence)).toEqual({ kind: "everyone" });
    expect(hasOwnerRights(s.board, s.state.presence, BOB)).toBe(true);
  });

  it("only owner can change phase while online", () => {
    const s = newState("start-stop-continue", [OWNER, ALICE]);
    const r = s.do({ type: "changePhase", phase: "group" }, ALICE);
    expect(!r.ok && r.error.code).toBe("forbidden");
    expect(s.do({ type: "changePhase", phase: "group" }).ok).toBe(true);
    expect(s.do({ type: "changePhase", phase: "write" }).ok).toBe(true); // backwards
  });

  describe("temporary owner", () => {
    const offlineOwner = () => newState("start-stop-continue", [ALICE, BOB]);

    it("is acquired when switching to Group or Discuss with owner offline", () => {
      const s = offlineOwner();
      s.must({ type: "changePhase", phase: "group" }, ALICE);
      expect(s.state.presence.temporaryOwnerSessionId).toBe(ALICE);
      expect(hasOwnerRights(s.board, s.state.presence, BOB)).toBe(false);
      expect(s.do({ type: "changePhase", phase: "discuss" }, BOB).ok).toBe(false);
    });

    it("is not acquired when switching to Write or Done", () => {
      const s = offlineOwner();
      s.must({ type: "changePhase", phase: "done" }, ALICE);
      expect(s.state.presence.temporaryOwnerSessionId).toBeNull();
      s.must({ type: "changePhase", phase: "write" }, ALICE);
      expect(s.state.presence.temporaryOwnerSessionId).toBeNull();
    });

    it("is not acquired when owner is online", () => {
      const s = newState("start-stop-continue", [OWNER, ALICE]);
      s.must({ type: "changePhase", phase: "group" });
      expect(s.state.presence.temporaryOwnerSessionId).toBeNull();
    });

    it("rights open up again when the temporary owner disconnects", () => {
      const s = offlineOwner();
      s.must({ type: "changePhase", phase: "group" }, ALICE);
      s.state = { ...s.state, presence: disconnect(s.state.presence, ALICE) };
      expect(s.state.presence.temporaryOwnerSessionId).toBeNull();
      expect(hasOwnerRights(s.board, s.state.presence, BOB)).toBe(true);
    });

    it("owner returns without temporary owner → regains rights, no prompt", () => {
      const s = offlineOwner();
      s.online(OWNER);
      expect(ownerReturnPromptPending(s.board, s.state.presence)).toBe(false);
      expect(hasOwnerRights(s.board, s.state.presence, OWNER)).toBe(true);
    });

    it("owner returns with temporary owner → prompt; temp keeps rights until decision", () => {
      const s = offlineOwner();
      s.must({ type: "changePhase", phase: "group" }, ALICE);
      s.online(OWNER);
      expect(ownerReturnPromptPending(s.board, s.state.presence)).toBe(true);
      expect(hasOwnerRights(s.board, s.state.presence, OWNER)).toBe(false);
      expect(hasOwnerRights(s.board, s.state.presence, ALICE)).toBe(true);
    });

    it("take over → owner exclusive again", () => {
      const s = offlineOwner();
      s.must({ type: "changePhase", phase: "group" }, ALICE);
      s.online(OWNER);
      s.must({ type: "resolveOwnerReturn", choice: "takeOver" });
      expect(hasOwnerRights(s.board, s.state.presence, OWNER)).toBe(true);
      expect(hasOwnerRights(s.board, s.state.presence, ALICE)).toBe(false);
      expect(s.board.ownerSessionId).toBe(OWNER);
    });

    it("decline → temporary owner becomes permanent owner", () => {
      const s = offlineOwner();
      s.must({ type: "changePhase", phase: "group" }, ALICE);
      s.online(OWNER);
      s.must({ type: "resolveOwnerReturn", choice: "decline" });
      expect(s.board.ownerSessionId).toBe(ALICE);
      expect(hasOwnerRights(s.board, s.state.presence, ALICE)).toBe(true);
      expect(hasOwnerRights(s.board, s.state.presence, OWNER)).toBe(false);
    });

    it("only the owner can resolve the prompt, and only when pending", () => {
      const s = offlineOwner();
      s.must({ type: "changePhase", phase: "group" }, ALICE);
      expect(s.do({ type: "resolveOwnerReturn", choice: "takeOver" }, OWNER).ok).toBe(false);
      s.online(OWNER);
      expect(s.do({ type: "resolveOwnerReturn", choice: "takeOver" }, ALICE).ok).toBe(false);
    });
  });
});
