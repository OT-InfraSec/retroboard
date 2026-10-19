import type { IncomingMessage, ServerResponse } from "node:http";
import type { Duplex } from "node:stream";

export interface Ui {
  handler: (req: IncomingMessage, res: ServerResponse) => unknown;
  upgrade?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
}

/** The Next.js app is added with the web work packages. */
export async function loadNext(dev: boolean): Promise<Ui> {
  void dev;
  return {
    handler: (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Retroboard");
    },
  };
}
