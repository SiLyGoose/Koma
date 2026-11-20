import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { brotliCompress, gzip } from 'node:zlib';
import type { RequestHandler } from 'express';
import { CONFIG } from '../../config.js';
import { encodingFor } from '../middleware/compress.js';
import { databankView } from '../models/databank.js';

/*
 * Every item and what it does at each level: the same for everyone, and changed only by the settings (re-read every
 * minute: services/settings.ts) or an update. So it's made once for the settings it's made with, compressed both ways
 * (brotli at its best: done once), and that is what everyone is sent, with its ETag: a browser asks again on each visit
 * (no-cache), and while it's unchanged is told so (304), with nothing to download.
 */

const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

interface Reply {
  etag: string;
  json: Buffer;
  br: Buffer;
  gzip: Buffer;
}

/** The reply, and the settings it was made with (as JSON). */
let made: { config: string; reply: Promise<Reply> } | null = null;

/** The databank's reply for the settings as they are (made afresh only when they've changed). */
function reply(): Promise<Reply> {
  const config = JSON.stringify(CONFIG);
  if (made?.config !== config) {
    const making = (async (): Promise<Reply> => {
      const json = Buffer.from(JSON.stringify(databankView()));
      const [br, gz] = await Promise.all([brotli(json), gzipped(json)]);
      return { etag: `W/"${createHash('sha1').update(json).digest('base64url')}"`, json, br, gzip: gz };
    })();
    made = { config, reply: making };
    // (One that couldn't be made is made again next time.)
    making.catch(() => {
      if (made?.reply === making) made = null;
    });
  }
  return made.reply;
}

export function databankController() {
  return {
    async view(req, res) {
      const { etag, json, br, gzip: gz } = await reply();
      // Kept by the browser, but asked about again each time (the default for the API is not to keep anything).
      res.set({ 'Cache-Control': 'no-cache', ETag: etag });
      if (req.fresh) return void res.status(304).end();
      const encoding = encodingFor(req.headers['accept-encoding'] ?? '');
      res.type('json');
      if (encoding) res.set('Content-Encoding', encoding);
      res.send(encoding === 'br' ? br : encoding === 'gzip' ? gz : json);
    },
  } satisfies Record<string, RequestHandler>;
}
