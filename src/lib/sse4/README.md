# SSE4's V3 importer, vendored

`vendor/` is built by Star System Explorer 4 (`crates/sse-convert-wasm`, FrunkQ/star-system-explorer,
Apache-2.0) and copied here by `scripts/vendor-sse4.mjs`, never edited by hand. `vendor/PIN` names the
SSE4 commit and each file's sha256. To update: build on an SSE4 main commit with
`scripts/build-convert-wasm.sh`, run the vendor script, and commit the four files together.

It is the same importer SSE4's kernel runs when a V3 save is adopted, so the report this site shows is
the report SSE4 will produce.
