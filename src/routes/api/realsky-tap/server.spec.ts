// THE ONLY SERVER ROUTE ON THIS SITE RELAYS REQUESTS TO A THIRD PARTY, so it is the one place where a
// mistake is a security problem rather than a wrong number. These pin the guards it copies from the
// engine's own proxy: it forwards one kind of catalogue query to one hard-coded address, and nothing
// else, whatever it is sent.
import { describe, it, expect } from 'vitest';
import { GET } from './+server';

type Seen = { url: string; init?: RequestInit };

function call(query: string | null) {
  const seen: Seen[] = [];
  const fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(url), init });
    return new Response(JSON.stringify([{ pl_name: 'TRAPPIST-1 b' }]), { status: 200 });
  };
  const url = new URL('https://convert.starsystemx.com/api/realsky-tap');
  if (query !== null) url.searchParams.set('query', query);
  return { seen, run: () => (GET as any)({ url, fetch }) as Promise<Response> };
}

/** SvelteKit's `error()` throws an HttpError; read its status whichever way it arrives. */
async function statusOf(p: Promise<Response>): Promise<number> {
  try { return (await p).status; } catch (e) { return (e as { status?: number }).status ?? -1; }
}

const GOOD = "select pl_name from pscomppars where CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', 1, 2, 3)) = 1";

describe('api/realsky-tap refuses what it is not for', () => {
  it('refuses an empty or missing query', async () => {
    expect(await statusOf(call(null).run())).toBe(400);
    expect(await statusOf(call('   ').run())).toBe(400);
  });

  it('refuses anything that is not a SELECT', async () => {
    const c = call('drop table pscomppars');
    expect(await statusOf(c.run())).toBe(400);
    expect(c.seen.length).toBe(0);                       // and never reaches upstream
  });

  it('refuses a SELECT against any table but pscomppars', async () => {
    const c = call('select * from ps');
    expect(await statusOf(c.run())).toBe(400);
    expect(c.seen.length).toBe(0);
  });

  it('refuses an oversized query', async () => {
    expect(await statusOf(call('select pl_name from pscomppars where ' + 'x'.repeat(2100)).run())).toBe(400);
  });
});

describe('api/realsky-tap forwards the one thing it is for, to the one place it goes', () => {
  it('sends a valid query to the hard-coded archive, by POST, with the ADQL in the body', async () => {
    const c = call(GOOD);
    const res = await c.run();
    expect(res.status).toBe(200);
    expect(c.seen.length).toBe(1);
    // Absolute: the destination is fixed in code. Nothing in the request can choose it.
    expect(c.seen[0].url).toBe('https://exoplanetarchive.ipac.caltech.edu/TAP/sync');
    expect(c.seen[0].init?.method).toBe('POST');
    const body = new URLSearchParams(String(c.seen[0].init?.body));
    expect(body.get('query')).toBe(GOOD);
    expect(body.get('format')).toBe('json');
  });

  it('cannot be pointed elsewhere by a query that mentions another address', async () => {
    const sneaky = "select pl_name from pscomppars where hostname = 'https://evil.example/'";
    const c = call(sneaky);
    await c.run();
    expect(c.seen[0].url).toBe('https://exoplanetarchive.ipac.caltech.edu/TAP/sync');
  });

  it('reports an upstream failure as a 502 rather than passing the page through', async () => {
    const url = new URL('https://convert.starsystemx.com/api/realsky-tap');
    url.searchParams.set('query', GOOD);
    const fetch = async () => new Response('<html>Attention Required! | Cloudflare</html>', { status: 403 });
    expect(await statusOf((GET as any)({ url, fetch }))).toBe(502);
  });
});
