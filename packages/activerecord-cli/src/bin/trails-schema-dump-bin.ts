import { run } from "./trails-schema-dump.js";

run(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`trails-schema-dump: ${msg}\n`);
    process.exit(1);
  },
);
