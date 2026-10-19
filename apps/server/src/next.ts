import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import type { Duplex } from "node:stream";
import next from "next";

export interface Ui {
  handler: (req: IncomingMessage, res: ServerResponse) => unknown;
  upgrade?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
}

/** Runs the Next.js app (apps/web) inside this process (ADR-001). */
export async function loadNext(dev: boolean): Promise<Ui> {
  const app = next({ dev, dir: resolve(import.meta.dirname, "../../web") });
  await app.prepare();
  return { handler: app.getRequestHandler(), upgrade: app.getUpgradeHandler() };
}
