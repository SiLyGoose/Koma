import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApi, type ApiDeps } from '../src/web/api.js';
import type { WebConfig } from '../src/web/config.js';
import { signRefreshToken, signToken, signWatchToken, verifyRefreshToken, verifyToken, verifyWatchToken } from '../src/web/auth/token.js';
import type { LinkRefresh } from '../src/protocol/site.js';

const SITE: WebConfig = { siteUrl: 'https://site', origin: 'https://site', apiUrl: 'https://bot', socketUrl: 'wss://bot', port: 0, clientSecret: 'shh' };

async function withApi(run: (ask: (body: unknown) => Promise<Response>) => Promise<void>, inServer = (_userId: string) => true): Promise<void> {
  const deps: ApiDeps = {
    config: SITE,
    clientId: () => '1',
    guild: (id) => (id === 'g' ? { name: 'Friends', icon: null } : null),
    memberName: async (_, userId) => (inServer(userId) ? 'INU now' : null),
    balance: async () => 0,
    avatar: () => null,
  };
  const server: Server = createServer(createApi(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    await run((body) => fetch(`${base}/api/link/refresh`, { method: 'POST', headers: { Origin: SITE.origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

const INU = { guildId: 'g', userId: 'u2', name: 'INU' };

test('link refresh: a refresh token renews its link but can neither play nor watch by itself', () => {
  const refresh = signRefreshToken({ player: INU, target: null }, 60_000);
  assert.deepEqual(verifyRefreshToken(refresh), { player: INU, target: null });
  assert.equal(verifyToken(refresh), null);
  assert.equal(verifyWatchToken(refresh), null);
  // Nor do a link's own tokens pass for one.
  assert.equal(verifyRefreshToken(signToken(INU, 60_000)), null);
  assert.equal(verifyRefreshToken(signWatchToken({ viewer: INU, targetId: 'u1' }, 60_000)), null);
  assert.equal(verifyRefreshToken(signRefreshToken({ player: INU, target: null }, 60_000, 0)), null);
});

test('link refresh api: a page trades its link for a refresh token, then that for new ones, long after the link ran out', async () => {
  await withApi(async (ask) => {
    const first = (await (await ask({ token: signToken(INU, 60_000) })).json()) as LinkRefresh;
    assert.deepEqual(verifyToken(first.token), { ...INU, name: 'INU now' });
    assert.ok(first.lastsMs > 0);

    // Its link gone by long since: the refresh token still renews it (made two days ago, it lasts a week).
    const old = signRefreshToken({ player: INU, target: null }, 7 * 24 * 60 * 60_000, Date.now() - 2 * 24 * 60 * 60_000);
    const later = (await (await ask({ refresh: old })).json()) as LinkRefresh;
    assert.equal(verifyToken(later.token)?.userId, 'u2');
    assert.deepEqual(verifyRefreshToken(later.refresh)?.player, { ...INU, name: 'INU now' });

    // A watch link stays a watch link.
    const watched = (await (await ask({ token: signWatchToken({ viewer: INU, targetId: 'u1' }, 60_000) })).json()) as LinkRefresh;
    assert.equal(verifyWatchToken(watched.token)?.targetId, 'u1');
    assert.equal(verifyToken(watched.token), null);
    assert.equal(verifyRefreshToken(watched.refresh)?.target, 'u1');

    // A link run out, a refresh token run out, or nonsense: not renewed.
    assert.equal((await ask({ token: signToken(INU, 60_000, 0) })).status, 401);
    assert.equal((await ask({ refresh: signRefreshToken({ player: INU, target: null }, 60_000, 0) })).status, 401);
    assert.equal((await ask({ refresh: first.token })).status, 401);
    assert.equal((await ask({ token: 'nonsense' })).status, 401);
    assert.equal((await ask({})).status, 400);
  });
});

test('link refresh api: not for someone no longer in the server', async () => {
  await withApi(
    async (ask) => {
      assert.equal((await ask({ refresh: signRefreshToken({ player: INU, target: null }, 60_000) })).status, 403);
    },
    () => false,
  );
});
