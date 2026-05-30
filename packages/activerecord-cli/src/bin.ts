import { run } from "./cli.js";

// The `ar` bin implementation — the only module that touches `process`, so
// `cli.ts` stays pure and unit-testable. The committed `bin/ar.js` shebang
// wrapper imports this; running it unconditionally is correct because the
// wrapper is only ever the executable entry, never imported as a library.
run(process.argv.slice(2), process.cwd()).then(
  (code) => process.exit(code),
  (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ar: ${message}`);
    process.exit(1);
  },
);
