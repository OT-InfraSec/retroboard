import { loadConfig } from "./config";
import { pgDb } from "./db/db";
import { migrate } from "./db/migrations";
import { boardRepo } from "./db/repo";
import { githubClient } from "./github";
import { loadNext } from "./next";
import { createApp } from "./server";

const config = loadConfig(process.env);
const db = pgDb(config.databaseUrl);
await migrate(db);

const ui = await loadNext(process.env.NODE_ENV !== "production");
const app = createApp({
  config,
  repo: boardRepo(db),
  github: githubClient(config.githubToken, config.githubRepo),
  uiHandler: ui.handler,
  uiUpgrade: ui.upgrade,
});

app.server.listen(config.port, () => console.log(`Retroboard listening on :${config.port}`));

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    app.close();
    void db.close().finally(() => process.exit(0));
  });
