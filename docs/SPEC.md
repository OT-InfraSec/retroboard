# Retroboard — Specification (MVP)

Status: agreed · Date: 2026-10-20

An interactive, real-time board for team retrospectives. Several people work on the same board at the same time; the board guides them through the phases **Write → Group → Discuss → Done**, and topics that need follow-up become GitHub issues.

---

## 1. Context & constraints

| Aspect | Decision |
|---|---|
| Users | Internal tool for a fixed set of teams (currently two). Up to ~20 people concurrently on one board. |
| Visibility | Everything is public to everyone who passes authentication. Teams can see each other's boards. |
| Hosting | Self-hosted via **Docker Compose**. A single server instance; no horizontal scaling. |
| Platform | Web app, **responsive** (desktop and phone). |
| Language | English UI only. |
| Persistence | Everything is stored permanently in **PostgreSQL**. Boards remain viewable weeks/months later. |
| Personal data | None. No accounts, no email, no SSO. Display names are free-text metadata. |
| Backups | Out of scope for the app (handled by operations). |

### Tech stack

- **TypeScript** throughout.
- **Next.js** frontend.
- **Node or Bun** backend.
- **WebSockets** for real-time synchronisation.
- **PostgreSQL** database.
- Chosen to be easy to change and extend after the MVP.

---

## 2. Glossary

| Term | Meaning |
|---|---|
| **Board** | One retrospective. Belongs to a team, has a name, a set of columns and cards. |
| **Team** | An entry from the fixed team list in the config file. Used for the default board name and shown with the board. |
| **Template** | A predefined set of columns chosen when creating a board. |
| **Column** | A category on the board (e.g. "Start"). |
| **Card** | One item written by a participant: text + author display name. |
| **Group** | A stack of two or more cards in the same column, created by dragging a card onto another. |
| **Topic** | The unit discussed in the Discuss phase: an ungrouped card, or a whole group. |
| **Session** | An anonymous identity per device: a random **session ID** in a long-lived cookie plus a **display name**. |
| **Owner** | The session that created the board (or the one it was transferred to, see §5). |
| **Temporary owner** | A session that took over owner rights while the owner was offline (see §5). |
| **Owner rights** | The set of owner-only actions listed in §5.4. |
| **Discussion order** | The sequence in which topics are presented in the Discuss phase (see §6.3). |
| **Read-only** | A board state in which no changes are possible (see §7). |
| **Activity / change** | Any persisted modification: card created/edited/deleted/moved/grouped, issue created, board or column renamed, column added/removed/reordered, phase changed. Viewing is **not** activity. |

---

## 3. Access & identity

### 3.1 Authentication
- The whole app (including WebSocket endpoint) is protected by **HTTP Basic Auth** with **one shared password** per instance.
- The password is configured via environment variable.
- Its only purpose is to keep external users out; it does not identify individuals.

### 3.2 Sessions
- On first visit, a device receives a random **session ID** stored in a long-lived cookie.
- The user is asked for a **display name** on first visit; it is stored with the session (cookie). It can be changed later.
- Any name can be chosen; no uniqueness or validation beyond non-empty.
- A user reconnecting with a valid session cookie resumes their identity, including owner role and card authorship.
- Short disconnects (network drops, sleeping laptop) must not change any ownership or permission state beyond what §5 describes for "online/offline".

### 3.3 Names on cards
- When a card is created, the author's **current display name is stored on the card and shown on it**.
- Changing the display name later does **not** update existing cards (snapshot at creation time).
- Card authorship (for edit/delete rights) is tied to the **session ID**, not the name. The session ID is never shown in the UI.

### 3.4 Presence
- A small box on the **right side of the board** lists participants who are currently online and those who were on the board but are offline.
- The owner (and a temporary owner, if any) is marked.

---

## 4. Boards

### 4.1 Board list (landing page)
- Lists **all boards** of all teams.
- **Sort order:** by **creation calendar day**, newest first. Within the same creation day, the board with the **most recent change** comes first (boards without changes after creation sort by creation time).
- **Search** by board name (substring, case-insensitive).
- No filters and no extra details in the list (name is enough; team may be part of the name).
- Clicking an entry opens the board.

### 4.2 Creating a board
- Fields:
  - **Team** — selected from the configured team list (required).
  - **Template** — one of the templates in §4.3 (required).
  - **Name** — required; pre-filled with `<Team> Retro – <YYYY-MM-DD>` and editable.
- The creating session becomes the **owner**.
- A new board starts in the **Write** phase.
- Boards are typically created about a week before the meeting so people can add cards in advance.

### 4.3 Templates
| Template | Columns |
|---|---|
| Start / Stop / Continue | Start · Stop · Continue |
| Went Well / To Improve / Action Ideas | Went Well · To Improve · Action Ideas |
| Mad / Sad / Glad | Mad · Sad · Glad |
| 4Ls | Liked · Learned · Lacked · Longed For |
| Sailboat | Wind · Anchor · Rocks · Island |

### 4.4 Editing a board (owner rights)
- Rename the board.
- Rename, add, remove, and reorder (move left/right) columns.
- **Removing a column with cards:** its cards (and groups) move to the **next column to the right**; if the removed column is the rightmost, they move to the column on its **left**.
- At least one column must always remain.

### 4.5 Deletion
- Boards cannot be deleted or archived in the MVP.

---

## 5. Ownership

### 5.1 Owner
- The creator's session is the owner. Ownership is recognised by session cookie and restored on reconnect.
- There is no explicit handover action.

### 5.2 Owner offline
- While neither the owner nor a temporary owner is online, **every participant has owner rights**.
- This includes seeing **all cards unblurred during the Group phase**.

### 5.3 Temporary owner
- If the owner is **offline** and a participant switches the phase to **Group** or **Discuss**, that participant becomes the **temporary owner**.
  - The temporary owner has exclusive owner rights.
  - All other participants return to the normal (non-owner) view and permissions.
- Switching to **Write** or **Done** while the owner is offline does not create a temporary owner.
- If the temporary owner disconnects, owner rights open up to everyone again (§5.2) until someone becomes temporary owner again.
- **Owner returns while a temporary owner exists:** the owner is shown a prompt with two choices:
  - **Take over** — the owner regains exclusive owner rights; the temporary owner becomes a normal participant.
  - **Decline** — the owner becomes a normal participant and the temporary owner becomes the **permanent owner** of the board (ownership is transferred to their session).
- **Owner returns while no temporary owner exists:** the owner regains exclusive owner rights immediately.

### 5.4 Owner rights
Only the participant(s) currently holding owner rights may:
- Change the phase (in either direction).
- Group and ungroup cards; move cards between columns.
- Navigate topics (Next / Previous) in the Discuss phase.
- Rename the board; edit columns (§4.4).
- Set the board read-only and reopen it.

Owner rights grant **no** power over other people's cards: the owner cannot edit or delete cards they did not write.

---

## 6. Phases

The board is always in exactly one phase: **Write**, **Group**, **Discuss**, or **Done**. The owner can switch to any phase at any time (forward or backward). Phase changes are pushed to all clients in real time.

### 6.1 Write
- Everyone can create cards in any column.
- **Visibility:** each participant sees their **own cards in clear text**; all other cards are **blurred** (position and existence visible, text not readable).
- Authors can edit and delete their own cards.

### 6.2 Group
- **Owner view:** all cards unblurred.
- **Non-owner view:** unchanged from Write — own cards clear, others blurred — **except** that cards the owner has grouped or moved become revealed for everyone. When a grouping involves a viewer's own card, the other cards in that group are revealed to them as a consequence.
- The owner can:
  - **Group:** drag a card onto another card (or onto an existing group) in the same column to stack them. Groups may contain any number of cards.
  - **Ungroup:** a **chain-break ("unlink") icon** on a grouped card removes it from the group.
  - **Move** cards/groups between columns.
- Grouping changes are pushed live to all participants.
- Everyone can still create cards; authors can edit/delete their own cards.
- If owner rights are open to everyone (§5.2), everyone sees all cards unblurred and can group.

### 6.3 Discuss
- **Single-topic view:** every participant sees **only the current topic** — one card, or all cards of a group shown together. Non-owners cannot view the full board in this phase.
- **Discussion order** (computed when entering Discuss):
  1. Columns from left to right.
  2. Within a column, topics ordered by creation time ascending; a group's position is the creation time of its **earliest** card.
  3. Cards created **during** Discuss are **appended to the end** of the order, regardless of column. The discussion order can therefore differ from the board order.
- If the owner goes back to Group and later returns to Discuss, the order is **recalculated** per the rules above. Saved times and discussed marks are **kept**.
- **Navigation (owner only):**
  - `→` or `Space` — next topic.
  - `←` — previous topic.
  - Equivalent on-screen buttons for touch devices.
  - All participants follow the owner's current topic automatically.
- **Timer:**
  - Starts automatically when a topic becomes current; visible to everyone.
  - Stops when the owner navigates away; the elapsed time is **persisted** for that topic.
  - Returning to a topic **continues** adding to its saved time.
- **Discussed mark:** pressing Next marks the topic being left as **discussed**. Discussed topics are **not** skipped; they remain in the order and display their discussed state and accumulated time.
- **Adding cards:** anyone can add a card via an **"Add card"** button that opens a dialog with a column picker. The card is appended to the discussion order.
- **No editing or deleting** of cards during Discuss (including one's own).
- **Creating issues:** anyone can create a GitHub issue from the current topic (button or `I` shortcut). See §8.

### 6.4 Done
- When the owner switches to Done, **all participants are switched to the full board view**, with **all cards unblurred**.
- Linked issue titles are visible on cards.
- Authors can edit and delete their own cards again; anyone can create cards.
- The board stays in Done until it becomes read-only (§7) or the owner switches phase.

---

## 7. Read-only

- A board becomes **read-only automatically 24 hours after its last change** (measured on the server).
- The owner can also **set read-only manually** at any time.
- Only the holder of owner rights can **reopen** a read-only board (while the owner is offline, whoever holds owner rights per §5.2/§5.3).
- In read-only state nothing can be changed: no card creation/editing/deletion, no grouping, no phase changes, no renames, no issue creation. The board remains fully viewable.
- Reopening counts as a change (resets the 24-hour window).

---

## 8. GitHub integration

### 8.1 Configuration
- Target: **github.com**.
- A **fine-grained personal access token** provided to the server via environment variable. All issues are created by the token's identity.
- One **target repository** (`owner/name`) for the whole company, configured via environment variable. (The repo is part of a GitHub Project; the app only creates issues, it does not touch the project.)

### 8.2 Creating an issue
- Available to **anyone** for the current topic in Discuss (button or `I`). (Not available while read-only.)
- A dialog with:
  - **Title** (optional). If left empty, the default is the **first sentence of the topic's text, truncated to ~50 characters** (with an ellipsis if cut). For a group, the earliest card's text is used.
  - **Additional description** (optional, free text) for extra context.
- A topic can have **multiple** issues.

### 8.3 Issue content
- **Title:** as above.
- **Body**, in this order:
  1. The text of the card(s) in the topic (all cards for a group).
  2. The additional description, if provided.
  3. At the bottom: a **deep link** back to the board that opens this specific topic.
- **Label:** `retro` added automatically.

### 8.4 Display
- Created issues are stored with the topic (issue number, URL, title).
- Cards show linked issues with a **shortened title** and link, both live during Discuss and when the board is revisited later (Done/read-only).
- Errors from GitHub (e.g. invalid token, repo not found) are shown to the user who tried to create the issue; nothing is stored on failure.

### 8.5 Deep links
- Format: `<PUBLIC_BASE_URL>/boards/<boardId>?topic=<topicId>` (exact path up to implementation).
- Opening a deep link shows the board with the referenced topic highlighted/scrolled into view. (Visibility rules of the board's current phase still apply.)

---

## 9. Cards

- Plain text, **max 500 characters**, non-empty.
- Stored with: board, column, text, author display name (snapshot), author session ID, creation time, group membership, revealed flag, discussed flag, accumulated discussion time (per topic), linked issues.
- Edit/delete rights: only the author (by session ID), and only in Write, Group, and Done, and only when not read-only.

---

## 10. Real-time behaviour

- All board state changes are broadcast via WebSocket to all connected clients of that board.
- The server is the source of truth; it validates every action against phase, ownership, authorship, and read-only state.
- **Visibility is enforced server-side:** clients must not receive the text of cards they are not allowed to see (blurred cards are sent without text).
- Concurrent conflicting actions resolve **last write wins** (MVP).
- Clients reconnect automatically and resynchronise full board state on reconnect.
- Presence (online/offline) is tracked per session per board.

---

## 11. Configuration

| Setting | Source | Example |
|---|---|---|
| Basic Auth password | env var | `BASIC_AUTH_PASSWORD` |
| GitHub PAT | env var | `GITHUB_TOKEN` |
| GitHub repository | env var | `GITHUB_REPO=acme/planning` |
| Public base URL (for deep links) | env var | `PUBLIC_BASE_URL=https://retro.internal.example` |
| Database connection | env var | `DATABASE_URL` |
| Teams list | config file | `teams: [Alpha, Beta]` |

Delivered as a `docker-compose.yml` with app and PostgreSQL services.

---

## 12. Testing

- **Automated tests for all domain logic**, including:
  - Phase transitions and owner-only enforcement.
  - Ownership: owner offline → open rights; temporary owner acquisition (only on Group/Discuss, only when owner offline); temporary owner disconnect; owner return with take-over / decline (transfer).
  - Visibility/blur rules per phase and role, including reveal-on-group/move.
  - Discussion order calculation, appending cards created during Discuss, recalculation with preserved times and discussed marks.
  - Timer accumulation and persistence.
  - Card edit/delete permissions per phase and read-only.
  - Column removal moving cards right (or left for the last column); minimum one column.
  - Auto read-only after 24 h without changes; manual read-only and reopen.
  - Board list sorting (creation day, then most recent change) and search.
  - GitHub issue title default (first sentence, ~50 chars) and body composition (cards, description, deep link), `retro` label.
- **End-to-end tests** for the main flow with multiple clients:
  - Create a board → several participants add cards (blurred for others) → owner groups → Discuss shows one topic at a time for everyone → timer advances and is stored when moving to the next topic → issue creation (GitHub mocked) → Done shows the full board.

---

## 13. Out of scope for the MVP (later)

- Shared, live-editable **notes per topic** (and real collaborative editing); notes would then also be included in issue bodies.
- **End-of-discussion summary** (topics, time spent, issues).
- **Group titles** (and using them as default issue titles).
- **Live issue status** (open/closed) from GitHub.
- Timer targets / time limits per topic.
- Voting.
- Board deletion / archiving.
- Live cursors / typing indicators.
- Multi-instance scaling.
