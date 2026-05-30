#!/usr/bin/env node
import { init } from "./init.js";

const HELP = `ar — the CLI for standalone @blazetrails/activerecord projects

Usage: ar <command> [options]

Commands:
  init                 Scaffold config/database.ts, db/, models/, and db.ts

Coming in later slices: generate, typecheck, schema:dump, and the db:*
commands (create, drop, migrate, rollback, migrate:status, seed, schema:dump,
setup, prepare, reset).

Run \`ar <command> --help\` for command-specific help.`;

const INIT_HELP = `ar init — scaffold a standalone activerecord project

Usage: ar init

Writes (relative to the current directory, never overwriting):
  config/database.ts   TRAILS_ENV-keyed connection config
  db/migrate/          migration directory
  db/seeds.ts          seed-data entrypoint
  models/index.ts      generated model manifest (import + register)
  db.ts                bootstrap glue (establishConnection + loadSchema)`;

/** Commands recognized but deferred to a later slice. */
const NOT_IMPLEMENTED = new Set([
  "generate",
  "typecheck",
  "schema:dump",
  "db:create",
  "db:drop",
  "db:migrate",
  "db:rollback",
  "db:migrate:status",
  "db:seed",
  "db:schema:dump",
  "db:setup",
  "db:prepare",
  "db:reset",
]);

function wantsHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

/**
 * Dispatch a parsed argv (the args after the `ar` binary name). Returns a
 * process exit code; never touches `process` itself so it stays unit-testable.
 */
export async function run(argv: string[], cwd: string): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "help" || wantsHelp([command ?? ""])) {
    console.log(HELP);
    return 0;
  }
  if (command === "init") {
    if (wantsHelp(rest)) {
      console.log(INIT_HELP);
      return 0;
    }
    const { created, skipped } = await init(cwd);
    for (const rel of created) console.log(`  create  ${rel}`);
    for (const rel of skipped) console.log(`  skip    ${rel} (already exists)`);
    console.log(
      `\nScaffolded ${created.length} file(s)${skipped.length ? `, skipped ${skipped.length}` : ""}.`,
    );
    return 0;
  }
  if (NOT_IMPLEMENTED.has(command)) {
    console.error(`ar: "${command}" is not implemented in this slice yet.`);
    return 1;
  }
  console.error(`ar: unknown command "${command}". Run \`ar --help\`.`);
  return 1;
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  run(process.argv.slice(2), process.cwd()).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    },
  );
}
