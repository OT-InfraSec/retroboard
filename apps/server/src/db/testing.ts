import { PGlite } from "@electric-sql/pglite";
import type { Db, Queryable } from "./db";
import { migrate } from "./migrations";

/** In-process Postgres (PGlite) for tests that need real SQL without Docker. */
type Lite = Pick<PGlite, "query" | "exec">;

const wrap = (lite: Lite): Queryable => ({
  async query(sql, params) {
    // exec() uses the simple protocol, which allows multi-statement migrations.
    if (!params) {
      const results = await lite.exec(sql);
      return { rows: (results.at(-1)?.rows ?? []) as never };
    }
    return { rows: (await lite.query(sql, params)).rows as never };
  },
});

/** In-process Postgres (PGlite) for tests that need real SQL without Docker. */
export async function testDb(): Promise<Db> {
  const lite = new PGlite();
  const db: Db = {
    ...wrap(lite),
    transaction: (fn) => lite.transaction((tx) => fn(wrap(tx))),
    close: () => lite.close(),
  };
  await migrate(db);
  return db;
}
