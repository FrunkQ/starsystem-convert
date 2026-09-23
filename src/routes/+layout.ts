// EVERYTHING IS PRERENDERED AND NOTHING RUNS ON THE SERVER. The whole point of this tool is that a
// save file never leaves the tab it was dropped into: the parsing, the conversion and the download all
// happen client-side. That is a privacy promise as much as an architecture, so the absence of a server
// route is load-bearing rather than incidental — there is nowhere for a file to be sent even by
// accident.
export const prerender = true;
export const ssr = true;
