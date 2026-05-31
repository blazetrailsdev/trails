import { run } from "./trails-models-dump.js";

run(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`trails-models-dump: ${msg}\n`);
    process.exit(1);
  },
);
