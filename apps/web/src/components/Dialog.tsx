"use client";
import { useEffect, useRef, type ReactNode } from "react";

export function Dialog(props: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="dialog" onClose={props.onClose} onCancel={props.onClose}>
      <h2>{props.title}</h2>
      {props.children}
    </dialog>
  );
}
