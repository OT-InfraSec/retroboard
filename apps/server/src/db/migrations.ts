import type { Db } from "./db";

export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_init",
    sql: `
      CREATE TABLE boards (
        id text PRIMARY KEY,
        team_id text NOT NULL,
        name text NOT NULL,
        template_id text NOT NULL,
        owner_session_id text NOT NULL,
        phase text NOT NULL CHECK (phase IN ('write','group','discuss','done')),
        read_only boolean NOT NULL DEFAULT false,
        created_at bigint NOT NULL,
        last_change_at bigint NOT NULL,
        current_topic_id text,
        current_topic_started_at bigint,
        discussion_order jsonb NOT NULL DEFAULT '[]'
      );
      CREATE INDEX boards_created_idx ON boards (created_at DESC);

      CREATE TABLE columns (
        id text PRIMARY KEY,
        board_id text NOT NULL REFERENCES boards(id),
        position integer NOT NULL,
        name text NOT NULL
      );
      CREATE INDEX columns_board_idx ON columns (board_id, position);

      CREATE TABLE cards (
        id text PRIMARY KEY,
        board_id text NOT NULL REFERENCES boards(id),
        column_id text NOT NULL,
        text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 500),
        author_name text NOT NULL,
        author_session_id text NOT NULL,
        created_at bigint NOT NULL,
        group_id text,
        revealed boolean NOT NULL DEFAULT false
      );
      CREATE INDEX cards_board_idx ON cards (board_id, created_at);

      CREATE TABLE topic_stats (
        board_id text NOT NULL REFERENCES boards(id),
        topic_id text NOT NULL,
        time_ms bigint NOT NULL DEFAULT 0,
        discussed boolean NOT NULL DEFAULT false,
        PRIMARY KEY (board_id, topic_id)
      );

      CREATE TABLE issues (
        id text PRIMARY KEY,
        board_id text NOT NULL REFERENCES boards(id),
        topic_id text NOT NULL,
        number integer NOT NULL,
        url text NOT NULL,
        title text NOT NULL,
        seq bigserial
      );
      CREATE INDEX issues_board_idx ON issues (board_id, seq);

      CREATE TABLE participants (
        board_id text NOT NULL REFERENCES boards(id),
        session_id text NOT NULL,
        public_id text NOT NULL,
        name text NOT NULL,
        seq bigserial,
        PRIMARY KEY (board_id, session_id)
      );
    `,
  },
];

export async function migrate(db: Db): Promise<void> {
  await db.query("CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY)");
  for (const m of MIGRATIONS) {
    await db.transaction(async (q) => {
      const done = await q.query("SELECT 1 FROM schema_migrations WHERE id = $1", [m.id]);
      if (done.rows.length) return;
      await q.query(m.sql);
      await q.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
    });
  }
}
