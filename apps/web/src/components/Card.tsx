"use client";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { useState } from "react";
import type { BoardView, CardView } from "@retroboard/domain";
import { shorten } from "@/lib/format";

export interface CardActions {
  edit(cardId: string, text: string): void;
  remove(cardId: string): void;
  unlink(cardId: string): void;
}

const MAX = 500;

export function Card(props: {
  card: CardView;
  view: BoardView;
  actions: CardActions;
  highlighted: boolean;
  /** Dragging is enabled in the Group phase for owner-rights holders. */
  dnd: boolean;
  /** Show the linked issues of this card's topic (once per group). */
  issues: BoardView["issues"];
}) {
  const { card, view, actions } = props;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(card.text ?? "");
  const drag = useDraggable({ id: `card:${card.id}`, disabled: !props.dnd });
  const drop = useDroppable({ id: `card:${card.id}`, disabled: !props.dnd });

  const canChange =
    card.mine &&
    !view.readOnly &&
    (view.phase === "write" || view.phase === "group" || view.phase === "done");
  const canUnlink = props.dnd && card.groupId !== null;
  const hidden = card.text === null;

  return (
    <div
      ref={(el) => {
        drag.setNodeRef(el);
        drop.setNodeRef(el);
      }}
      id={`card-${card.id}`}
      className={[
        "card",
        hidden ? "blurred" : "",
        card.mine ? "mine" : "",
        props.highlighted ? "highlight" : "",
        drop.isOver ? "over" : "",
        drag.isDragging ? "dragging" : "",
        props.dnd ? "draggable" : "",
      ].join(" ")}
      {...(props.dnd ? drag.listeners : {})}
      {...(props.dnd ? drag.attributes : {})}
    >
      {hidden ? (
        <div role="img" aria-label="Hidden card" className="placeholder">
          <span />
          <span />
        </div>
      ) : editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) actions.edit(card.id, text);
            setEditing(false);
          }}
        >
          <textarea
            autoFocus
            value={text}
            maxLength={MAX}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row end">
            <button type="button" onClick={() => setEditing(false)}>
              Cancel
            </button>
            <button className="primary" disabled={!text.trim()}>
              Save
            </button>
          </div>
        </form>
      ) : (
        <>
          <p className="card-text">{card.text}</p>
          <div className="card-meta">
            <span className="muted">{card.authorName}</span>
            <span className="row tight">
              {canUnlink && (
                <button
                  className="icon"
                  title="Remove from group"
                  aria-label="Remove from group"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => actions.unlink(card.id)}
                >
                  Unlink
                </button>
              )}
              {canChange && (
                <>
                  <button
                    className="icon"
                    title="Edit"
                    aria-label="Edit card"
                    onClick={() => {
                      setText(card.text ?? "");
                      setEditing(true);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="icon"
                    title="Delete"
                    aria-label="Delete card"
                    onClick={() => confirm("Delete this card?") && actions.remove(card.id)}
                  >
                    🗑
                  </button>
                </>
              )}
            </span>
          </div>
        </>
      )}
      {props.issues.length > 0 && (
        <ul className="issues">
          {props.issues.map((i) => (
            <li key={i.id}>
              <a href={i.url} target="_blank" rel="noopener noreferrer" title={i.title}>
                #{i.number} {shorten(i.title)}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
