"use client";
import { useEffect, useState } from "react";
import { defaultIssueTitle, type BoardView } from "@retroboard/domain";
import { formatDuration, toneClass } from "@/lib/format";
import type { Sender } from "@/lib/socket";
import { Card } from "./Card";
import { Dialog } from "./Dialog";

type Act = (m: Parameters<Sender>[0]) => void;

const noop = { edit() {}, remove() {}, unlink() {} };

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function Discuss(props: { view: BoardView; receivedAt: number; send: Sender; act: Act }) {
  const { view, act } = props;
  const d = view.discussion!;
  const [dialog, setDialog] = useState<"card" | "issue" | null>(null);
  const now = useNow(d.running);
  const elapsed = d.timeMs + (d.running ? Math.max(0, now - props.receivedAt) : 0);
  const rights = view.viewer.hasOwnerRights && !view.readOnly;
  const topicCards = view.cards;
  const canIssue = !view.readOnly && d.currentTopicId !== null;
  const columnIdx = view.columns.findIndex((c) => c.id === topicCards[0]?.columnId);
  const column = columnIdx >= 0 ? view.columns[columnIdx] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (
        dialog ||
        el.closest("input, textarea, select, dialog, button, a") ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey
      )
        return;
      if (rights && (e.key === "ArrowRight" || e.key === " ")) {
        e.preventDefault();
        act({ type: "navigate", direction: "next" });
      } else if (rights && e.key === "ArrowLeft") {
        e.preventDefault();
        act({ type: "navigate", direction: "prev" });
      } else if (canIssue && e.key.toLowerCase() === "i") {
        e.preventDefault();
        setDialog("issue");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, rights, canIssue, act]);

  return (
    <section className="discuss">
      <div className="discuss-bar">
        <div>
          <strong>{d.count === 0 ? "No topics" : `Topic ${d.index + 1} of ${d.count}`}</strong>
          {d.discussed && <span className="badge ok">discussed</span>}
        </div>
        <div className="timer" aria-label="Time on this topic">
          {formatDuration(elapsed)}
        </div>
      </div>

      {d.count === 0 ? (
        <p className="muted">Nothing to discuss yet. Add a card to get started.</p>
      ) : (
        <div className={`discuss-topic ${column ? toneClass(column.name, columnIdx) : ""}`}>
          {column && <span className="column-chip">{column.name}</span>}
          <div className={topicCards.length > 1 ? "group" : undefined}>
            {topicCards.map((c, i) => (
              <Card
                key={c.id}
                card={c}
                view={view}
                actions={noop}
                dnd={false}
                highlighted={false}
                issues={i === 0 ? view.issues : []}
              />
            ))}
          </div>
        </div>
      )}

      <div className="row wrap discuss-actions">
        {rights && (
          <>
            <button
              onClick={() => act({ type: "navigate", direction: "prev" })}
              disabled={d.index <= 0}
            >
              ← Previous
            </button>
            <button
              className="primary"
              onClick={() => act({ type: "navigate", direction: "next" })}
              disabled={d.count === 0}
            >
              Next →
            </button>
          </>
        )}
        <span className="grow" />
        {!view.readOnly && <button onClick={() => setDialog("card")}>Add card</button>}
        {canIssue && (
          <button onClick={() => setDialog("issue")} title="Shortcut: I">
            Create issue
          </button>
        )}
      </div>
      {rights && <p className="muted small hint">Next: → or Space · Previous: ← · Issue: I</p>}

      {dialog === "card" && <AddCardDialog view={view} onClose={() => setDialog(null)} act={act} />}
      {dialog === "issue" && d.currentTopicId && (
        <IssueDialog
          topicId={d.currentTopicId}
          suggested={defaultIssueTitle(topicCards[0]?.text ?? "")}
          send={props.send}
          onClose={() => setDialog(null)}
        />
      )}
    </section>
  );
}

function AddCardDialog(props: { view: BoardView; act: Act; onClose: () => void }) {
  const [columnId, setColumnId] = useState(props.view.columns[0]?.id ?? "");
  const [text, setText] = useState("");
  return (
    <Dialog title="Add card" onClose={props.onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          props.act({ type: "createCard", columnId, text });
          props.onClose();
        }}
      >
        <label>
          Column
          <select value={columnId} onChange={(e) => setColumnId(e.target.value)}>
            {props.view.columns.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Card
          <textarea
            autoFocus
            value={text}
            maxLength={500}
            rows={4}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <p className="muted small">New cards are appended to the end of the discussion.</p>
        <div className="row end">
          <button type="button" onClick={props.onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!text.trim()}>
            Add card
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function IssueDialog(props: {
  topicId: string;
  suggested: string;
  send: Sender;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog title="Create GitHub issue" onClose={props.onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await props.send({
              type: "createIssue",
              topicId: props.topicId,
              title: title.trim() || undefined,
              description: description.trim() || undefined,
            });
            props.onClose();
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create the issue");
            setBusy(false);
          }
        }}
      >
        <label>
          Title <span className="muted small">(optional)</span>
          <input
            autoFocus
            value={title}
            maxLength={256}
            placeholder={props.suggested}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Additional description <span className="muted small">(optional)</span>
          <textarea
            value={description}
            rows={4}
            maxLength={5000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <p className="muted small">
          The card text and a link back to this topic are added automatically.
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row end">
          <button type="button" onClick={props.onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Creating…" : "Create issue"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
