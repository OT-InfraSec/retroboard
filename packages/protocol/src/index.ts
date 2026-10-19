import { z } from "zod";
import type { BoardView } from "@retroboard/domain";

export const MAX_MESSAGE_BYTES = 8 * 1024;

const id = z.string().min(1).max(100);
const text = z.string().max(2000);

/** Messages a client may send. Author names and session ids are never client-supplied. */
export const ClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("changePhase"),
    phase: z.enum(["write", "group", "discuss", "done"]),
  }),
  z.object({ type: z.literal("setReadOnly"), readOnly: z.boolean() }),
  z.object({ type: z.literal("renameBoard"), name: text }),
  z.object({ type: z.literal("addColumn"), name: text }),
  z.object({ type: z.literal("renameColumn"), columnId: id, name: text }),
  z.object({ type: z.literal("removeColumn"), columnId: id }),
  z.object({ type: z.literal("moveColumn"), columnId: id, direction: z.enum(["left", "right"]) }),
  z.object({ type: z.literal("createCard"), columnId: id, text }),
  z.object({ type: z.literal("editCard"), cardId: id, text }),
  z.object({ type: z.literal("deleteCard"), cardId: id }),
  z.object({ type: z.literal("groupCard"), cardId: id, targetCardId: id }),
  z.object({ type: z.literal("ungroupCard"), cardId: id }),
  z.object({ type: z.literal("moveCard"), cardId: id, columnId: id }),
  z.object({ type: z.literal("navigate"), direction: z.enum(["next", "prev"]) }),
  z.object({ type: z.literal("resolveOwnerReturn"), choice: z.enum(["takeOver", "decline"]) }),
  z.object({
    type: z.literal("createIssue"),
    topicId: id,
    title: z.string().max(256).optional(),
    description: z.string().max(5000).optional(),
  }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/** `requestId` lets a client correlate an error/result with what it sent. */
export const ClientEnvelope = z
  .object({ requestId: z.string().max(64).optional() })
  .and(ClientMessage);
export type ClientEnvelope = z.infer<typeof ClientEnvelope>;

export type ServerMessage =
  | { type: "state"; view: BoardView; serverTime: number }
  | { type: "error"; message: string; requestId?: string }
  | { type: "ok"; requestId?: string; issue?: { number: number; url: string; title: string } };

export const CreateBoardRequest = z.object({
  teamId: z.string().min(1).max(100),
  templateId: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
});
export const SetNameRequest = z.object({ name: z.string().trim().min(1).max(50) });
