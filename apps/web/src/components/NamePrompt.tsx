"use client";
import { useState } from "react";

export function NamePrompt(props: {
  initial: string;
  onSave: (name: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(props.initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <main className="center">
      <form
        className="panel narrow"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await props.onSave(name.trim());
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not save");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1>Welcome to Retroboard</h1>
        <p className="muted">Choose the name other participants will see on your cards.</p>
        <label>
          Display name
          <input autoFocus value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="row">
          <button className="primary" disabled={busy || !name.trim()}>
            Continue
          </button>
          {props.onCancel && (
            <button type="button" onClick={props.onCancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
