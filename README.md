# Retroboard

Real-time board for team retrospectives: **Write → Group → Discuss → Done**, with follow-ups created as GitHub issues. See [docs/SPEC.md](docs/SPEC.md) for the specification and [docs/WORK_PACKAGES.md](docs/WORK_PACKAGES.md) for the implementation breakdown.

## Run with Docker Compose

```bash
cp .env.example .env        # then edit the values
$EDITOR config/teams.json   # the fixed list of teams
docker compose up --build -d
```

Open `PUBLIC_BASE_URL` (default http://localhost:3000). The browser asks for HTTP Basic Auth: any username, the password from `BASIC_AUTH_PASSWORD`. Database migrations run automatically on start. Backups of the `pgdata` volume are up to operations.

### Configuration

| Variable              | Purpose                                                                           |
| --------------------- | --------------------------------------------------------------------------------- |
| `BASIC_AUTH_PASSWORD` | Shared password for the whole app (HTTP and WebSocket)                            |
| `GITHUB_TOKEN`        | Fine-grained PAT with **Issues: read and write** on the target repo               |
| `GITHUB_REPO`         | Target repository, `owner/name`                                                   |
| `PUBLIC_BASE_URL`     | Public URL, used for deep links in issues; `https://` also marks cookies `Secure` |
| `DATABASE_URL`        | Postgres connection string (set by compose)                                       |
| `TEAMS_FILE`          | Optional path to the teams JSON (default `config/teams.json`)                     |

Put the app behind a TLS-terminating reverse proxy that forwards WebSocket upgrades; Basic Auth sends the password with every request.

## Development

```bash
npm install
npm test             # domain, repository (in-process Postgres) and server/WebSocket tests
npm run typecheck && npm run lint
```

Run the app locally without Docker or Postgres (in-memory database, data is lost on restart):

```bash
BASIC_AUTH_PASSWORD=pw GITHUB_TOKEN=x GITHUB_REPO=acme/planning \
PUBLIC_BASE_URL=http://localhost:3000 DATABASE_URL=pglite: npm run dev
```

Layout: `packages/domain` (all rules, pure), `packages/protocol` (wire schemas), `apps/server` (auth, REST, WebSocket hub, Postgres, GitHub), `apps/web` (Next.js UI, served by the server process).
