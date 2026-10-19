import { applyAction, type Action, type State } from "./actions";
import { createBoard } from "./board";
import { connect, emptyPresence } from "./ownership";
import type { Ctx } from "./types";

export const OWNER = "owner";
export const ALICE = "alice";
export const BOB = "bob";

export function makeCtx(start = 1_000_000) {
  let now = start;
  let n = 0;
  const ctx: Ctx = {
    get now() {
      return now;
    },
    newId: () => `id${++n}`,
  };
  return { ctx, advance: (ms: number) => void (now += ms) };
}

export function newState(templateId = "start-stop-continue", online: string[] = [OWNER]) {
  const t = makeCtx();
  const created = createBoard(
    { teamId: "Alpha", templateId, name: "Retro", ownerSessionId: OWNER },
    t.ctx,
  );
  if (!created.ok) throw new Error("board");
  let presence = emptyPresence();
  for (const s of online) presence = connect(presence, s);
  let state: State = { board: created.value, presence };
  const api = {
    ...t,
    get state() {
      return state;
    },
    set state(s: State) {
      state = s;
    },
    get board() {
      return state.board;
    },
    cols: () => state.board.columns.map((c) => c.id),
    do(action: Action, actor = OWNER) {
      const r = applyAction(state, action, actor, t.ctx);
      if (r.ok) state = r.value;
      return r;
    },
    must(action: Action, actor = OWNER) {
      const r = api.do(action, actor);
      if (!r.ok) throw new Error(`${action.type}: ${r.error.message}`);
      return state;
    },
    card(text: string, col = 0, actor = ALICE) {
      t.advance(10);
      api.must(
        { type: "createCard", columnId: state.board.columns[col]!.id, text, authorName: actor },
        actor,
      );
      return state.board.cards.at(-1)!;
    },
    online(...ids: string[]) {
      for (const i of ids) state = { ...state, presence: connect(state.presence, i) };
    },
  };
  return api;
}
