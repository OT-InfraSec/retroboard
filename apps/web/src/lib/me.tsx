"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";
import { NamePrompt } from "@/components/NamePrompt";

interface Me {
  name: string;
  rename: () => void;
}
const MeContext = createContext<Me | null>(null);
export const useMe = () => useContext(MeContext)!;

/** Asks for a display name on first visit and exposes it (SPEC §3.2). */
export function MeProvider({ children }: { children: ReactNode }) {
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((m) => setName(m.name))
      .catch(() => setName(null));
  }, []);

  const rename = useCallback(() => setEditing(true), []);

  if (name === undefined) return <p className="center muted">Loading…</p>;
  if (name === null || editing)
    return (
      <NamePrompt
        initial={name ?? ""}
        onCancel={name ? () => setEditing(false) : undefined}
        onSave={async (n) => {
          const saved = await api.setName(n);
          setName(saved.name);
          setEditing(false);
        }}
      />
    );
  return <MeContext.Provider value={{ name, rename }}>{children}</MeContext.Provider>;
}
