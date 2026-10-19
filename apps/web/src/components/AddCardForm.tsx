"use client";
import { useState } from "react";

export function AddCardForm({ onAdd }: { onAdd: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    onAdd(text);
    setText("");
  };
  return (
    <form
      className="add-card"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        aria-label="New card"
        placeholder="Add a card…"
        value={text}
        maxLength={500}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <div className="row end">
        <span className="muted small">{text.length}/500</span>
        <button disabled={!text.trim()}>Add</button>
      </div>
    </form>
  );
}
