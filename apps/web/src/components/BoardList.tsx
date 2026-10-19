"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { BoardSummary } from "@retroboard/domain";
import { api } from "@/lib/api";
import { useMe } from "@/lib/me";
import { CreateBoard } from "./CreateBoard";

export function BoardList() {
  const { name, rename } = useMe();
  const [q, setQ] = useState("");
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(
      () =>
        api
          .boards(q)
          .then((r) => setBoards(r.boards))
          .catch((e: Error) => setError(e.message)),
      200,
    );
    return () => clearTimeout(t);
  }, [q]);

  return (
    <main className="page">
      <header className="topbar">
        <h1>Retroboard</h1>
        <div className="row">
          <button className="link" onClick={rename} title="Change display name">
            {name}
          </button>
          <button className="primary" onClick={() => setCreating(true)}>
            New board
          </button>
        </div>
      </header>
      <input
        type="search"
        placeholder="Search boards by name"
        aria-label="Search boards"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {boards === null ? (
        <p className="muted">Loading…</p>
      ) : boards.length === 0 ? (
        <p className="muted">
          {q ? "No boards match your search." : "No boards yet. Create the first one."}
        </p>
      ) : (
        <ul className="list">
          {boards.map((b) => (
            <li key={b.id}>
              <Link href={`/boards/${b.id}`}>{b.name}</Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateBoard onClose={() => setCreating(false)} />}
    </main>
  );
}
