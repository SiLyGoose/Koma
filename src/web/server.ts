import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { MINE_WEB } from '../constants/index.js';
import { handleApi, type ApiDeps } from './api.js';
import { GAMES } from './config.js';
import { serveMine } from './mine-server.js';
import { servePinecraft } from './pinecraft-server.js';

/*
 * The bot's side of the games' web site: one server, listening on this machine only (Caddy in front
 * of it gives it its public https:// and wss:// address). It answers the site's requests under /api
 * (api.ts), and takes the games' web sockets: the mine's (mine-server.ts) and Pinecraft's
 * (pinecraft-server.ts). Only the site's own origin may connect.
 */

export interface WebServerOptions {
  port: number;
  host?: string;
  api: ApiDeps;
}

const SOCKETS: Record<string, (socket: WebSocket) => void> = {
  [GAMES.mines.socket]: serveMine,
  [GAMES.pinecraft.socket]: (socket) => servePinecraft(socket),
};

/** Starts the server. Returns a function that stops it. */
export function startWebServer({ port, host = '127.0.0.1', api }: WebServerOptions): () => Promise<void> {
  const { origin } = api.config;
  const http = createServer((req, res) => {
    void handleApi(req, res, api).then((handled) => {
      if (handled) return;
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    });
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: MINE_WEB.maxMessageBytes });
  // Connections that stopped answering (a phone gone to sleep) are dropped.
  const alive = new WeakSet<WebSocket>();

  http.on('upgrade', (req, socket, head) => {
    const path = new URL(req.url ?? '/', 'http://bot').pathname;
    const serve = SOCKETS[path];
    if (!serve || req.headers.origin !== origin) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      alive.add(ws);
      ws.on('pong', () => alive.add(ws));
      serve(ws);
    });
  });

  const ping = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.has(socket)) {
        socket.terminate();
        continue;
      }
      alive.delete(socket);
      socket.ping();
    }
  }, MINE_WEB.pingMs);
  ping.unref();

  http.on('error', (err) => console.error("The games' web server failed:", err));
  http.listen(port, host, () =>
    console.log(
      `The games' web server is listening on ${host}:${port} for ${origin} (${Object.keys(SOCKETS).join(', ')}, /api${api.config.clientSecret ? ', with Discord login' : ', no login: DS_CLIENT_SECRET is not set'}).`,
    ),
  );

  return () =>
    new Promise((resolve) => {
      clearInterval(ping);
      for (const socket of wss.clients) socket.terminate();
      wss.close();
      http.close(() => resolve());
      http.closeAllConnections();
    });
}
