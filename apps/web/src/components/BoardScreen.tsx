"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { BoardView, Phase } from "@retroboard/domain";
import { useMe } from "@/lib/me";
import { useBoardSocket, type Sender } from "@/lib/socket";
import { Columns } from "./Columns";
import { Dialog } from "./Dialog";
import { Discuss } from "./Discuss";
import { Presence } from "./Presence";

const PHASES: { id: Phase; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "group", label: "Group" },
  { id: "discuss", label: "Discuss" },
  { id: "done", label: "Done" },
];

export function BoardScreen({ boardId }: { boardId: string }) {
  const { name, rename } = useMe();
  const { view, status, error, clearError, receivedAt, send } = useBoardSocket(boardId, name);
  const [localError, setLocalError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);

  useEffect(() => {
    setHighlight(new URLSearchParams(location.search).get("topic"));
  }, []);

  const act = useCallback(
    (msg: Parameters<Sender>[0]) => {
      send(msg).catch((e: Error) => setLocalError(e.message));
    },
    [send],
  );

  const message = localError ?? error;
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => {
      setLocalError(null);
      clearError();
    }, 5000);
    return () => clearTimeout(t);
  }, [message, clearError]);

  useEffect(() => {
    // Scroll a deep-linked topic into view once it is rendered.
    if (!highlight || !view) return;
    const card = view.cards.find((c) => (c.groupId ?? c.id) === highlight);
    if (card)
      document
        .getElementById(`card-${card.id}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [highlight, view?.phase, view?.cards.length]);

  if (status === "notfound")
    return (
      <main className="center">
        <div className="panel narrow">
          <h1>Board not found</h1>
          <Link href="/">Back to all boards</Link>
        </div>
      </main>
    );
  if (!view)
    return (
      <p className="center muted">{status === "reconnecting" ? "Reconnecting…" : "Connecting…"}</p>
    );

  const canEdit = view.viewer.hasOwnerRights && !view.readOnly;

  return (
    <main className="board-page">
      <header className="board-head">
        <Link href="/" aria-label="All boards" className="back">
          ←
        </Link>
        <BoardTitle
          name={view.name}
          editable={canEdit}
          onRename={(n) => act({ type: "renameBoard", name: n })}
        />
        <nav className="phases" aria-label="Phase">
          {PHASES.map((p) => (
            <button
              key={p.id}
              className={p.id === view.phase ? "phase active" : "phase"}
              aria-current={p.id === view.phase ? "step" : undefined}
              disabled={!canEdit || p.id === view.phase}
              onClick={() => act({ type: "changePhase", phase: p.id })}
            >
              {p.label}
            </button>
          ))}
        </nav>
        <button className="link" onClick={rename} title="Change display name">
          {name}
        </button>
      </header>

      {status === "reconnecting" && (
        <div className="banner warn">Connection lost — reconnecting…</div>
      )}
      {view.readOnly && (
        <div className="banner">
          This board is read-only.
          {view.viewer.hasOwnerRights && (
            <button onClick={() => act({ type: "setReadOnly", readOnly: false })}>
              Reopen board
            </button>
          )}
        </div>
      )}
      {view.viewer.hasOwnerRights && !view.readOnly && view.viewer.isTemporaryOwner && (
        <div className="banner">You are the temporary owner of this board.</div>
      )}

      <div className="board-body">
        <div className="board-main">
          {view.phase === "discuss" ? (
            <Discuss view={view} receivedAt={receivedAt} send={send} act={act} />
          ) : (
            <Columns view={view} act={act} highlightTopic={highlight} />
          )}
        </div>
        <div className="board-side">
          <Presence view={view} />
          {canEdit && (
            <button
              className="small"
              onClick={() =>
                confirm("Set this board to read-only?") &&
                act({ type: "setReadOnly", readOnly: true })
              }
            >
              Set read-only
            </button>
          )}
        </div>
      </div>

      {view.viewer.ownerReturnPrompt && <OwnerReturn view={view} act={act} />}
      {message && (
        <div
          className="toast"
          role="alert"
          onClick={() => {
            setLocalError(null);
            clearError();
          }}
        >
          {message}
        </div>
      )}
    </main>
  );
}

function BoardTitle(props: { name: string; editable: boolean; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(props.name);
  if (!editing)
    return props.editable ? (
      <button
        className="link board-title"
        title="Rename board"
        onClick={() => {
          setValue(props.name);
          setEditing(true);
        }}
      >
        {props.name}
      </button>
    ) : (
      <h1 className="board-title">{props.name}</h1>
    );
  const done = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== props.name) props.onRename(value);
  };
  return (
    <input
      autoFocus
      className="title-input board-title"
      value={value}
      maxLength={100}
      onChange={(e) => setValue(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === "Enter") done();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

function OwnerReturn({ view, act }: { view: BoardView; act: (m: Parameters<Sender>[0]) => void }) {
  const temp = view.participants.find((p) => p.isTemporaryOwner);
  return (
    <Dialog title="Welcome back" onClose={() => {}}>
      <p>
        {temp ? <strong>{temp.name}</strong> : "Another participant"} took over this board while you
        were away.
      </p>
      <p className="muted">
        Take over to get owner rights back, or decline to make them the permanent owner.
      </p>
      <div className="row end">
        <button onClick={() => act({ type: "resolveOwnerReturn", choice: "decline" })}>
          Decline
        </button>
        <button
          className="primary"
          onClick={() => act({ type: "resolveOwnerReturn", choice: "takeOver" })}
        >
          Take over
        </button>
      </div>
    </Dialog>
  );
}
