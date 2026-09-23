// THE ONE THING THIS SITE DOES ON A SERVER: ask the NASA Exoplanet Archive about planets.
//
// Everything else happens in the browser, and a save file never comes near here. This route exists
// because the archive sends no `Access-Control-Allow-Origin` header — measured from this origin on
// 2026-09-23 — so a browser is not allowed to read its answers directly, and the planets around a
// looked-up star would silently come from a stale snapshot instead. SIMBAD sends the header and is
// asked straight from the page; this route is for the archive alone.
//
// SAME PATH AS THE ENGINE'S OWN PROXY, deliberately. The vendored real-sky loader falls back to
// `/api/realsky-tap` when the direct query fails, so serving it here means that code runs unmodified.
// It is a copy of the engine's route (src/routes/api/realsky-tap/+server.ts) and keeps its guards:
//
//  - NOT AN OPEN PROXY. The upstream is hard-coded, so no request can point it anywhere else, and only
//    a SELECT against `pscomppars` — the confirmed-planet table — is forwarded, under a length cap.
//  - POST UPSTREAM, NOT GET. The archive now sits behind Cloudflare, whose firewall answers the
//    region query's `CONTAINS(POINT(...), CIRCLE(...))` in a query string with a 403 challenge page.
//    The identical ADQL as a form body is answered normally. The engine's route relayed that 403 as a
//    502 and its import fell back to the snapshot without a word; both are fixed the same way.
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// A live query, answered per request — the one route on this site that is not prerendered.
export const prerender = false;

const ARCHIVE_TAP = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';
const MAX_QUERY_LENGTH = 2000;

export const GET: RequestHandler = async ({ url, fetch }) => {
  const query = url.searchParams.get('query') ?? '';
  const q = query.trim().toLowerCase();
  if (!q || query.length > MAX_QUERY_LENGTH) error(400, 'missing or oversized query');
  if (!q.startsWith('select') || !q.includes('from pscomppars')) {
    error(400, 'only SELECT queries against pscomppars are forwarded');
  }
  const upstream = await fetch(ARCHIVE_TAP, {
    method: 'POST',
    headers: { 'User-Agent': 'starsystem-convert real-sky lookup (same-origin proxy)' },
    body: new URLSearchParams({ query, format: 'json' })
  });
  if (!upstream.ok) error(502, `archive TAP: HTTP ${upstream.status}`);
  return json(await upstream.json(), {
    // The confirmed-planet table changes weekly at most. A short shared cache means a star several
    // people look up in the same hour costs the archive one query, not one per person.
    headers: { 'Cache-Control': 'public, max-age=3600' }
  });
};
