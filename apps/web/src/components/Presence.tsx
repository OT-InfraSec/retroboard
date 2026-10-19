"use client";
import type { BoardView } from "@retroboard/domain";

export function Presence({ view }: { view: BoardView }) {
  const online = view.participants.filter((p) => p.online);
  const offline = view.participants.filter((p) => !p.online);
  const row = (p: BoardView["participants"][number]) => (
    <li key={p.publicId} className={p.online ? "" : "muted"}>
      <span className={`dot ${p.online ? "on" : ""}`} aria-hidden />
      {p.name}
      {p.isYou && <span className="muted small"> (you)</span>}
      {p.isOwner && <span className="badge">owner</span>}
      {p.isTemporaryOwner && <span className="badge">temporary owner</span>}
    </li>
  );
  return (
    <aside className="presence" aria-label="Participants">
      <h3>Online ({online.length})</h3>
      <ul>{online.map(row)}</ul>
      {offline.length > 0 && (
        <>
          <h3>Offline ({offline.length})</h3>
          <ul>{offline.map(row)}</ul>
        </>
      )}
    </aside>
  );
}
