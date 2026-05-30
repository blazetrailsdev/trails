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

Run in the project root. Writes config/database.ts (TRAILS_ENV-keyed),
db/migrate/, db/seeds.ts, models/index.ts (the generated manifest), and db.ts
(bootstrap glue). Existing files are never overwritten.`;

/** Commands recognized but deferred to a later slice (see proposal §5). */
const NOT_IMPLEMENTED = new Set(
  (
    "generate typecheck schema:dump db:create db:drop db:migrate db:rollback " +
    "db:migrate:status db:seed db:schema:dump db:setup db:prepare db:reset"
  ).split(" "),
);

function wantsHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

/**
 * Dispatch a parsed argv (the args after the `ar` binary name). Returns a
 * process exit code; never touches `process` itself so it stays unit-testable.
 */
export async function run(argv: string[], cwd: string): Promise<number> {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help" || command === "-h") {
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
