import type { RequestHandler } from 'express';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

/*
 * The API's JSON replies compressed, for a browser that takes it (every one does): brotli, else gzip. Nothing on the
 * way to the site compresses them (Fly passes them on as they are), and some are big: a member's heroes, with every
 * copy's effect lines, a tenth of that compressed. Done off the main thread (zlib's own threads), so the games'
 * sockets aren't held up meanwhile. (The databank's reply, the same for everyone, is compressed once:
 * ../controllers/databank.ts.)
 */

/** Replies smaller than this go as they are: compressing them saves next to nothing. */
const MIN_BYTES = 1024;
/** Brotli's quality: 11 (its default) takes far longer for a few percent more; 5 is about gzip's speed, and smaller. */
const BROTLI_QUALITY = 5;

const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

/** Which of brotli and gzip the request says it takes (null: neither). */
export function encodingFor(accepts: string): 'br' | 'gzip' | null {
  const offered = accepts.split(',').map((part) => {
    const [name = '', ...params] = part.trim().toLowerCase().split(';');
    const q = params.map((p) => /^\s*q=([\d.]+)\s*$/.exec(p)?.[1]).find((v) => v !== undefined);
    return { name: name.trim(), q: q === undefined ? 1 : Number(q) };
  });
  const takes = (name: string): boolean => offered.some((o) => (o.name === name || o.name === '*') && o.q > 0);
  return takes('br') ? 'br' : takes('gzip') ? 'gzip' : null;
}

/** Sends `res.json` replies compressed when the request takes it (see the top of this file). */
export const compressJson: RequestHandler = (req, res, next) => {
  res.vary('Accept-Encoding');
  const encoding = encodingFor(req.headers['accept-encoding'] ?? '');
  if (!encoding) return next();
  const plain = res.json.bind(res);
  res.json = (body: unknown) => {
    const text = JSON.stringify(body);
    if (text === undefined || Buffer.byteLength(text) < MIN_BYTES) return plain(body);
    const squeezed =
      encoding === 'br'
        ? brotli(text, { params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY, [constants.BROTLI_PARAM_SIZE_HINT]: Buffer.byteLength(text) } })
        : gzipped(text);
    void squeezed.then(
      (data) => {
        res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': encoding });
        res.send(data);
      },
      // (It couldn't be compressed: sent as it is.)
      () => void plain(body),
    );
    return res;
  };
  next();
};
