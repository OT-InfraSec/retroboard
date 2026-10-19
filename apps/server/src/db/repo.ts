import type { Board, BoardSummary } from "@retroboard/domain";
import type { Db, Queryable } from "./db";

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v);

export interface BoardRepo {
  load(id: string): Promise<Board | null>;
  /** Persists the whole aggregate in one transaction (inserts if new). */
  save(board: Board): Promise<void>;
  listSummaries(): Promise<BoardSummary[]>;
}

export function boardRepo(db: Db): BoardRepo {
  return {
    async load(id) {
      const boards = await db.query<Row>("SELECT * FROM boards WHERE id = $1", [id]);
      const b = boards.rows[0];
      if (!b) return null;
      const [columns, cards, stats, issues, participants] = await Promise.all([
        db.query<Row>("SELECT * FROM columns WHERE board_id = $1 ORDER BY position", [id]),
        db.query<Row>("SELECT * FROM cards WHERE board_id = $1 ORDER BY created_at, id", [id]),
        db.query<Row>("SELECT * FROM topic_stats WHERE board_id = $1", [id]),
        db.query<Row>("SELECT * FROM issues WHERE board_id = $1 ORDER BY seq", [id]),
        db.query<Row>("SELECT * FROM participants WHERE board_id = $1 ORDER BY seq", [id]),
      ]);
      return {
        id,
        teamId: b.team_id as string,
        name: b.name as string,
        templateId: b.template_id as string,
        ownerSessionId: b.owner_session_id as string,
        phase: b.phase as Board["phase"],
        readOnly: b.read_only as boolean,
        createdAt: num(b.created_at),
        lastChangeAt: num(b.last_change_at),
        currentTopicId: (b.current_topic_id as string | null) ?? null,
        currentTopicStartedAt:
          b.current_topic_started_at === null ? null : num(b.current_topic_started_at),
        discussionOrder: b.discussion_order as string[],
        columns: columns.rows.map((c) => ({ id: c.id as string, name: c.name as string })),
        cards: cards.rows.map((c) => ({
          id: c.id as string,
          columnId: c.column_id as string,
          text: c.text as string,
          authorName: c.author_name as string,
          authorSessionId: c.author_session_id as string,
          createdAt: num(c.created_at),
          groupId: (c.group_id as string | null) ?? null,
          revealed: c.revealed as boolean,
        })),
        topicStats: Object.fromEntries(
          stats.rows.map((s) => [
            s.topic_id as string,
            { timeMs: num(s.time_ms), discussed: s.discussed as boolean },
          ]),
        ),
        issues: issues.rows.map((i) => ({
          id: i.id as string,
          topicId: i.topic_id as string,
          number: num(i.number),
          url: i.url as string,
          title: i.title as string,
        })),
        participants: participants.rows.map((p) => ({
          sessionId: p.session_id as string,
          publicId: p.public_id as string,
          name: p.name as string,
        })),
      };
    },

    save: (board) => db.transaction((q) => saveBoard(q, board)),

    async listSummaries() {
      const r = await db.query<Row>(
        "SELECT id, name, team_id, created_at, last_change_at FROM boards",
      );
      return r.rows.map((b) => ({
        id: b.id as string,
        name: b.name as string,
        teamId: b.team_id as string,
        createdAt: num(b.created_at),
        lastChangeAt: num(b.last_change_at),
      }));
    },
  };
}

async function saveBoard(q: Queryable, b: Board): Promise<void> {
  await q.query(
    `INSERT INTO boards (id, team_id, name, template_id, owner_session_id, phase, read_only,
       created_at, last_change_at, current_topic_id, current_topic_started_at, discussion_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET name = $3, owner_session_id = $5, phase = $6, read_only = $7,
       last_change_at = $9, current_topic_id = $10, current_topic_started_at = $11,
       discussion_order = $12`,
    [
      b.id,
      b.teamId,
      b.name,
      b.templateId,
      b.ownerSessionId,
      b.phase,
      b.readOnly,
      b.createdAt,
      b.lastChangeAt,
      b.currentTopicId,
      b.currentTopicStartedAt,
      JSON.stringify(b.discussionOrder),
    ],
  );

  await q.query("DELETE FROM columns WHERE board_id = $1", [b.id]);
  for (const [i, c] of b.columns.entries())
    await q.query("INSERT INTO columns (id, board_id, position, name) VALUES ($1,$2,$3,$4)", [
      c.id,
      b.id,
      i,
      c.name,
    ]);

  const cardIds = b.cards.map((c) => c.id);
  await q.query("DELETE FROM cards WHERE board_id = $1 AND NOT (id = ANY($2::text[]))", [
    b.id,
    cardIds,
  ]);
  for (const c of b.cards)
    await q.query(
      `INSERT INTO cards (id, board_id, column_id, text, author_name, author_session_id,
         created_at, group_id, revealed)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET column_id = $3, text = $4, group_id = $8, revealed = $9`,
      [
        c.id,
        b.id,
        c.columnId,
        c.text,
        c.authorName,
        c.authorSessionId,
        c.createdAt,
        c.groupId,
        c.revealed,
      ],
    );

  for (const [topicId, s] of Object.entries(b.topicStats))
    await q.query(
      `INSERT INTO topic_stats (board_id, topic_id, time_ms, discussed) VALUES ($1,$2,$3,$4)
       ON CONFLICT (board_id, topic_id) DO UPDATE SET time_ms = $3, discussed = $4`,
      [b.id, topicId, s.timeMs, s.discussed],
    );

  for (const i of b.issues)
    await q.query(
      `INSERT INTO issues (id, board_id, topic_id, number, url, title) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING`,
      [i.id, b.id, i.topicId, i.number, i.url, i.title],
    );

  for (const p of b.participants)
    await q.query(
      `INSERT INTO participants (board_id, session_id, public_id, name) VALUES ($1,$2,$3,$4)
       ON CONFLICT (board_id, session_id) DO UPDATE SET name = $4`,
      [b.id, p.sessionId, p.publicId, p.name],
    );
}
