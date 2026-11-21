# The converter as a module

`src/lib/module/index.ts` is the converter's one public entry point. The site's own page uses it, and
so do other StarSystemX sites (Star System Explorer 4, Explorers), so import and export code lives in
one place.

## Where to get it

| | |
|---|---|
| Hosted | `https://convert.starsystemx.com/module/v1/convert.js` (ES module, any origin may load it) |
| Types | `https://convert.starsystemx.com/module/v1/convert.d.ts` |
| Pin | `https://convert.starsystemx.com/module/v1/manifest.json` gives the release and each file's sha256 |
| Build it yourself | `npm run build:module` writes the same three files to `static/module/v1/` |

`v1` is the API version. It changes only when a caller would have to change. A caller that bundles a
copy (recommended for SSE4, so it works offline) should record the manifest's `version` and `sha256`
with anything it imports.

## Use

```ts
import { formats, detect, open, write, convert } from 'https://convert.starsystemx.com/module/v1/convert.js';

const bytes = new Uint8Array(await file.arrayBuffer());
const opened = open(file.name, bytes);          // format, systems in the file, body preview
const { system, report } = opened.read({ system: 0, minBodyMassKg: opened.massFilter?.recommendedMinKg });
const { file: out, losses } = write(system, 'spaceengine');
// or all at once:
const result = convert(file.name, bytes, { to: 'ubox' });
```

Everything is synchronous and pure. Nothing is fetched, and a file never leaves the calling tab.
Errors are `ConvertError` with a `code`: `unknown_format`, `unreadable`, `no_system`, `not_writable`.

The `report` says what the conversion did: `counts`, `assumptions` (what the reader had to assume),
`skipped` (what was left behind, with reasons) and `losses` (what the target format could not hold).

The pivot `system` is plain JSON in the Star System Explorer 3 save shape. Treat it as opaque and
hand it back to `write`.

The real-star lookup (SIMBAD and the NASA Exoplanet Archive) is not in the module. It needs the
network and this site's archive route, so it stays with the page.
