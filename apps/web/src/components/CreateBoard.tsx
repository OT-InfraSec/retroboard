"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type Meta } from "@/lib/api";
import { Dialog } from "./Dialog";

/** `<Team> Retro – <YYYY-MM-DD>` using the user's local date (SPEC §4.2). */
function defaultName(team: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${team} Retro – ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function CreateBoard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [team, setTeam] = useState("");
  const [template, setTemplate] = useState("");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .meta()
      .then((m) => {
        setMeta(m);
        setTeam(m.teams[0] ?? "");
        setTemplate(m.templates[0]?.id ?? "");
        setName(defaultName(m.teams[0] ?? ""));
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Dialog title="New board" onClose={onClose}>
      {!meta ? (
        <p className="muted">{error ?? "Loading…"}</p>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              const { id } = await api.createBoard({ teamId: team, templateId: template, name });
              router.push(`/boards/${id}`);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not create board");
              setBusy(false);
            }
          }}
        >
          <label>
            Team
            <select
              value={team}
              onChange={(e) => {
                setTeam(e.target.value);
                if (!nameEdited) setName(defaultName(e.target.value));
              }}
            >
              {meta.teams.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          <label>
            Template
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              {meta.templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input
              value={name}
              maxLength={100}
              onChange={(e) => {
                setName(e.target.value);
                setNameEdited(true);
              }}
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="row end">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="primary" disabled={busy || !name.trim()}>
              Create board
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
