# Retroboard — Work Packages

Source: [SPEC.md](SPEC.md). Architecture: `.10x/adrs/001–003`. Every WP is independently implementable, ends with passing tests and a commit, and lists the spec sections it covers.

Layout (pnpm workspace, Node):
- `packages/domain` — pure TypeScript, no I/O. All rules from the spec live here.
- `packages/protocol` — zod schemas for client↔server messages and the projected board view.
- `apps/server` — one Node process: Basic Auth, session cookie, Next.js (custom server), WebSocket gateway, Postgres, GitHub client.
- `apps/web` — Next.js UI (rendered by the server process).

## Dependency overview

```
WP0 ─┬─ WP1 ─┬─ WP2 ─┐
     │       ├─ WP3 ─┤
     │       ├─ WP4 ─┼─ WP8 ─ WP9 ─┬─ WP12 ─ WP13 ─ WP14 ─ WP15 ─┐
     │       ├─ WP5 ─┤      │      │                               ├─ WP17 ─ WP18
     │       └─ WP6 ─┘      │      └─ WP11 ───────────────────────┘
     └─ WP7 ────────────────┘                  WP16 (after WP9)
                    WP10 (after WP6, WP8)
```
Parallelizable: WP2–WP6 after WP1; WP7 alongside the domain WPs; WP11 alongside WP9/WP10.

---

## Foundation

### WP0 — Workspace scaffold & tooling
Spec: §1 tech stack. pnpm workspace, TS strict, Vitest, ESLint/Prettier, `packages/{domain,protocol}`, `apps/{server,web}` skeletons, root scripts (`test`, `typecheck`, `lint`, `dev`).
Done when: `pnpm test && pnpm typecheck && pnpm lint` pass on an empty-but-wired repo.

### WP1 — Domain core: types, phases, ownership, permissions
Spec: §2, §3.2–3.3, §5, §6 (phase switching), §9 (card rules).
Types: Board, Column, Card, Topic, Session, Phase. Pure functions: `ownerRightsHolders(board, presence)` (owner online / open rights / temporary owner / take-over / decline→transfer), `canDo(action, actor, board)` (phase, owner-only, authorship, read-only), phase transitions incl. temp-owner acquisition (only Group/Discuss, only owner offline), card validation (non-empty, ≤500).
Tests: every bullet of SPEC §12 ownership + permissions.

## Domain (all depend on WP1; mutually parallel)

### WP2 — Visibility projection
Spec: §6.1–6.4, §10. `projectBoard(state, viewer)`: blur (text stripped, not just hidden) per phase/role, reveal on owner group/move, reveal group-mates of viewer's own card, Discuss single-topic projection, Done unblurred, owner-rights-open unblurred.
Tests: matrix of phase × role × card ownership × reveal flag; assert no text leaks.

### WP3 — Board editing & grouping ops
Spec: §4.4, §6.2. Rename board; add/remove/rename/reorder columns (min 1; removal moves cards right, last column → left); group (same column, onto card or group), ungroup, move card/group between columns; sets `revealed`.

### WP4 — Discussion order, timer, discussed marks
Spec: §6.3. Order computation (columns L→R, creation time, group = earliest card), append cards created in Discuss, recompute on re-entry preserving times/marks, next/prev with timer accumulation (injected clock), discussed mark on Next.

### WP5 — Read-only & board list logic
Spec: §4.1, §7. Auto read-only after 24 h from last change (server clock injected), manual set/reopen, reopen counts as change; list sort (creation day desc, then last change desc, then creation time) and case-insensitive substring search.

### WP6 — GitHub issue composition
Spec: §8.2–8.3, §8.5. Default title (first sentence, ~50 chars, ellipsis, earliest card for group), body (cards → description → deep link), `retro` label, deep-link builder.

## Backend

### WP7 — Database schema, migrations, repositories (DBA)
Spec: §1 persistence, §9 storage. Drizzle schema + SQL migrations: teams are config-only; tables `boards, columns, cards, topics(timer, discussed), issues, participants(session, name, last seen)`. Indexes for list sort/search. Repository interface (load board aggregate, save in a transaction), tested against real Postgres (Testcontainers or compose service).

### WP8 — Server foundation
Spec: §3.1–3.2, §11. Config (env + teams file, fail fast), HTTP Basic Auth on all HTTP + WS upgrade (constant-time compare), session cookie (random ID, long-lived, HttpOnly, SameSite), REST: list/search boards, create board, get teams/templates, set display name; Next.js custom-server wiring.

### WP9 — Realtime gateway
Spec: §3.4, §5, §10. WS endpoint per board, per-board action queue (serialises → last-write-wins), validate via domain, persist, broadcast per-viewer projections, presence tracking (online/offline per session), owner-rights recomputation on connect/disconnect, owner-return prompt events, full resync on connect, timer persistence on navigate/disconnect, read-only sweeper job.

### WP10 — GitHub integration
Spec: §8. Thin client (Octokit or fetch) behind an interface, create issue with title/body/`retro` label, store number/URL/title on topic, error surfacing to requester only, nothing stored on failure, blocked when read-only. Contract tests with a mock server.

## Frontend

### WP11 — Web shell, identity, board list & creation
Spec: §3.2, §4.1–4.3. Responsive layout, first-visit display-name prompt (+ change later), landing list with search, create-board form (team, template, prefilled name).

### WP12 — Board view + Write phase
Spec: §3.3–3.4, §6.1, §9. WS client with auto-reconnect/resync, columns & cards, blurred rendering, add/edit/delete own card, presence box (online/offline, owner markers), phase indicator and owner phase switch.

### WP13 — Group phase UI & board editing
Spec: §4.4, §6.2. Drag-and-drop grouping (touch-friendly), unlink icon, move between columns, column rename/add/remove/reorder, board rename.

### WP14 — Discuss phase UI
Spec: §6.3, §8.2. Single-topic view, owner navigation (→/Space/←, on-screen buttons), live timer display, discussed state, "Add card" dialog with column picker, issue dialog (+`I` shortcut), issue links on cards.

### WP15 — Done, read-only, ownership prompts, deep links
Spec: §5.3, §6.4, §7, §8.4–8.5. Done full view, read-only banner + owner reopen/set-read-only, owner-return Take over/Decline prompt, temp-owner indicator, `?topic=` deep link highlight/scroll.

## Delivery & verification

### WP16 — Docker Compose & docs
Spec: §11. Multi-stage Dockerfile, `docker-compose.yml` (app + postgres, volumes, healthcheck, migrations on start), `.env.example`, teams config sample, README (setup, env vars, GitHub token scopes).

### WP17 — End-to-end tests
Spec: §12. Playwright, multiple browser contexts, GitHub mocked: create → cards blurred → group → Discuss single topic → timer stored → issue → Done full board. Plus owner-offline/temporary-owner/takeover scenario.

### WP18 — QA & security review
Basic-auth + WS auth, session cookie flags, server-side authorization on every action, blurred-text leak check on the wire, XSS (card text rendering), GitHub token handling, input limits/rate limiting of WS messages, dependency audit. Reports in `.10x/reviews/`.
