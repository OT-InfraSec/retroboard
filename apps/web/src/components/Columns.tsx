"use client";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { useState } from "react";
import type { BoardView, CardView } from "@retroboard/domain";
import type { Sender } from "@/lib/socket";
import { AddCardForm } from "./AddCardForm";
import { Card } from "./Card";

interface Block {
  key: string;
  groupId: string | null;
  cards: CardView[];
}

/** Single cards and groups in creation order (group position = earliest card). */
function blocksOf(cards: CardView[]): Block[] {
  const sorted = [...cards].sort((a, b) => a.createdAt - b.createdAt);
  const out: Block[] = [];
  const byGroup = new Map<string, Block>();
  for (const c of sorted) {
    if (c.groupId) {
      const existing = byGroup.get(c.groupId);
      if (existing) existing.cards.push(c);
      else {
        const b = { key: c.groupId, groupId: c.groupId, cards: [c] };
        byGroup.set(c.groupId, b);
        out.push(b);
      }
    } else out.push({ key: c.id, groupId: null, cards: [c] });
  }
  return out;
}

export function Columns(props: {
  view: BoardView;
  act: (m: Parameters<Sender>[0]) => void;
  highlightTopic: string | null;
}) {
  const { view, act } = props;
  const dnd = view.phase === "group" && view.viewer.hasOwnerRights && !view.readOnly;
  const canEdit = view.viewer.hasOwnerRights && !view.readOnly;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    if (!dnd || !e.over) return;
    const cardId = String(e.active.id).replace("card:", "");
    const overId = String(e.over.id);
    const card = view.cards.find((c) => c.id === cardId);
    if (!card) return;
    if (overId.startsWith("col:")) {
      const columnId = overId.slice(4);
      if (columnId !== card.columnId) act({ type: "moveCard", cardId, columnId });
    } else {
      const target = view.cards.find((c) => c.id === overId.replace("card:", ""));
      if (!target || target.id === card.id) return;
      if (target.columnId !== card.columnId)
        act({ type: "moveCard", cardId, columnId: target.columnId });
      else if (!(card.groupId && card.groupId === target.groupId))
        act({ type: "groupCard", cardId, targetCardId: target.id });
    }
  };

  const actions = {
    edit: (cardId: string, text: string) => act({ type: "editCard", cardId, text }),
    remove: (cardId: string) => act({ type: "deleteCard", cardId }),
    unlink: (cardId: string) => act({ type: "ungroupCard", cardId }),
  };

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="columns">
        {view.columns.map((col, idx) => (
          <Column key={col.id} id={col.id} enabled={dnd}>
            <header className="col-head">
              <ColumnTitle
                name={col.name}
                editable={canEdit}
                onRename={(name) => act({ type: "renameColumn", columnId: col.id, name })}
              />
              <span className="muted small">
                {view.cards.filter((c) => c.columnId === col.id).length}
              </span>
              {canEdit && (
                <span className="row tight">
                  <button
                    className="icon"
                    aria-label="Move column left"
                    disabled={idx === 0}
                    onClick={() => act({ type: "moveColumn", columnId: col.id, direction: "left" })}
                  >
                    ←
                  </button>
                  <button
                    className="icon"
                    aria-label="Move column right"
                    disabled={idx === view.columns.length - 1}
                    onClick={() =>
                      act({ type: "moveColumn", columnId: col.id, direction: "right" })
                    }
                  >
                    →
                  </button>
                  <button
                    className="icon"
                    aria-label="Remove column"
                    disabled={view.columns.length === 1}
                    onClick={() =>
                      confirm(
                        `Remove column "${col.name}"? Its cards move to a neighbouring column.`,
                      ) && act({ type: "removeColumn", columnId: col.id })
                    }
                  >
                    ✕
                  </button>
                </span>
              )}
            </header>
            <div className="cards">
              {blocksOf(view.cards.filter((c) => c.columnId === col.id)).map((b) => (
                <div key={b.key} className={b.groupId ? "group" : undefined}>
                  {b.cards.map((c, i) => (
                    <Card
                      key={c.id}
                      card={c}
                      view={view}
                      actions={actions}
                      dnd={dnd}
                      highlighted={
                        props.highlightTopic !== null &&
                        (c.groupId ?? c.id) === props.highlightTopic
                      }
                      issues={
                        i === 0 ? view.issues.filter((x) => x.topicId === (c.groupId ?? c.id)) : []
                      }
                    />
                  ))}
                </div>
              ))}
            </div>
            {!view.readOnly && (
              <AddCardForm onAdd={(text) => act({ type: "createCard", columnId: col.id, text })} />
            )}
          </Column>
        ))}
        {canEdit && <AddColumn onAdd={(name) => act({ type: "addColumn", name })} />}
      </div>
    </DndContext>
  );
}

function Column({
  id,
  enabled,
  children,
}: {
  id: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${id}`, disabled: !enabled });
  return (
    <section ref={setNodeRef} className={`column ${isOver ? "over" : ""}`}>
      {children}
    </section>
  );
}

function ColumnTitle(props: { name: string; editable: boolean; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(props.name);
  if (!editing)
    return props.editable ? (
      <button
        className="link title"
        title="Rename column"
        onClick={() => {
          setValue(props.name);
          setEditing(true);
        }}
      >
        {props.name}
      </button>
    ) : (
      <h3 className="title">{props.name}</h3>
    );
  const done = () => {
    setEditing(false);
    if (value.trim() && value.trim() !== props.name) props.onRename(value);
  };
  return (
    <input
      autoFocus
      className="title-input"
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

function AddColumn({ onAdd }: { onAdd: (name: string) => void }) {
  return (
    <button
      className="add-column"
      onClick={() => {
        const name = prompt("Column name");
        if (name?.trim()) onAdd(name);
      }}
    >
      + Add column
    </button>
  );
}
