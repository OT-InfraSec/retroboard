"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardView } from "@retroboard/domain";
import type { ClientMessage, ServerMessage } from "@retroboard/protocol";

export type Status = "connecting" | "open" | "reconnecting" | "notfound";

export interface Sender {
  (msg: ClientMessage): Promise<{ issue?: { number: number; url: string; title: string } }>;
}

/**
 * Keeps a WebSocket to the board, reconnecting with backoff. The server sends the full
 * state on every connect, so reconnecting resynchronises automatically (SPEC §10).
 * `identity` changes (e.g. a new display name) force a fresh connection.
 */
export function useBoardSocket(boardId: string, identity: string) {
  const [view, setView] = useState<BoardView | null>(null);
  const [status, setStatus] = useState<Status>("connecting");
  const [error, setError] = useState<string | null>(null);
  /** Local clock reading when the latest state arrived, for the discussion timer. */
  const [receivedAt, setReceivedAt] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const pending = useRef(
    new Map<string, { resolve: (v: never) => void; reject: (e: Error) => void }>(),
  );

  useEffect(() => {
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(
        `${proto}://${location.host}/ws/boards/${encodeURIComponent(boardId)}`,
      );
      wsRef.current = ws;
      ws.onopen = () => {
        attempt = 0;
        setStatus("open");
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        if (msg.type === "state") {
          setView(msg.view);
          setReceivedAt(Date.now());
        } else if (msg.type === "error") {
          // Requests made through send() report their own error to the caller.
          const p = msg.requestId ? pending.current.get(msg.requestId) : undefined;
          if (p && msg.requestId) {
            pending.current.delete(msg.requestId);
            p.reject(new Error(msg.message));
          } else setError(msg.message);
        } else if (msg.type === "ok" && msg.requestId) {
          pending.current.get(msg.requestId)?.resolve(msg as never);
          pending.current.delete(msg.requestId);
        }
      };
      ws.onclose = (ev) => {
        // A superseded socket (e.g. React strict-mode remount) must not clobber the live one.
        if (wsRef.current === ws) wsRef.current = null;
        for (const p of pending.current.values()) p.reject(new Error("Connection lost"));
        pending.current.clear();
        if (stopped) return;
        if (ev.code === 4404) return setStatus("notfound");
        setStatus("reconnecting");
        timer = setTimeout(connect, Math.min(10_000, 500 * 2 ** attempt++));
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [boardId, identity]);

  const send: Sender = useCallback((msg) => {
    return new Promise((resolve, reject) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return reject(new Error("Not connected"));
      const requestId = crypto.randomUUID();
      pending.current.set(requestId, { resolve: resolve as never, reject });
      ws.send(JSON.stringify({ ...msg, requestId }));
    });
  }, []);

  return { view, status, error, clearError: () => setError(null), receivedAt, send };
}
