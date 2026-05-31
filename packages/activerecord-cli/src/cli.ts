import { getPathAsync } from "@blazetrails/activesupport";
import { init } from "./init.js";
import { generateManifest } from "./generate-manifest.js";
import { delegateBin } from "./delegate.js";

const HELP = `ar — the CLI for standalone @blazetrails/activerecord projects

Usage: ar <command> [options]

Commands:
  init                 Scaffold config/database.ts, db/, app/models/, and db.ts
  generate:manifest    Scan app/models/ and (re)write app/models/index.ts
  typecheck            Type-check your models via trails-tsc
  schema:dump          Dump the current schema via trails-schema-dump
  models:dump          Dump model metadata via trails-models-dump

Coming in later slices: the db:* commands (create, drop, migrate, rollback,
migrate:status, seed, schema:dump, setup, prepare, reset).

Run \`ar <command> --help\` for command-specific help.`;

const MANIFEST_HELP = `ar generate:manifest — regenerate app/models/index.ts

Scans the models directory for exported classes that (transitively) extend
\`Base\` and rewrites the registration manifest in stable alphabetical order.
Idempotent: a second run is a no-op.

Options:
  --root <dir>   Directory to scan (default: ./app/models)
  --check        Don't write; exit 1 if app/models/index.ts is out of date (CI).`;

const INIT_HELP = `ar init — scaffold a standalone activerecord project

Run in the project root. Writes config/database.ts (TRAILS_ENV-keyed),
db/migrate/, db/seeds.ts, app/models/index.ts (the generated manifest), and
db.ts (bootstrap glue). Existing files are never overwritten.`;

/** Commands recognized but deferred to a later slice (see proposal §5). */
const NOT_IMPLEMENTED = new Set(
  (
    "generate db:create db:drop db:migrate db:rollback " +
    "db:migrate:status db:seed db:schema:dump db:setup db:prepare db:reset"
  ).split(" "),
);

function wantsHelp(args: string[]): boolean {
  return args.includes("--help") || args.includes("-h");
}

/**
 * Read the directory after `--root`. Returns `{ value }` (undefined when the
 * flag is absent → caller's default applies), or `null` when `--root` is given
 * without a usable value (missing, or another flag) — an input error the caller
 * surfaces rather than silently scanning the wrong tree.
 */
function readRootFlag(args: string[]): { value: string | undefined } | null {
  const i = args.indexOf("--root");
  if (i < 0) return { value: undefined };
  const value = args[i + 1];
  if (value === undefined || value.startsWith("-")) return null;
  return { value };
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
  if (command === "generate:manifest") {
    if (wantsHelp(rest)) {
      console.log(MANIFEST_HELP);
      return 0;
    }
    const root = readRootFlag(rest);
    if (!root) {
      console.error("ar: --root requires a directory argument.");
      return 1;
    }
    // Resolve `--root` (and the default) against the caller's `cwd`, not the
    // process's — keeps `run(argv, cwd)` self-consistent; absolute roots pass
    // through unchanged.
    const modelsDir = (await getPathAsync()).resolve(cwd, root.value ?? "app/models");
    const check = rest.includes("--check");
    const { path, changed } = await generateManifest(modelsDir, { check });
    if (check) {
      if (changed) {
        // Echo back `--root` so the suggested fix regenerates the directory
        // that was actually checked, not the default `app/models`.
        const fix = root.value
          ? `ar generate:manifest --root ${root.value}`
          : "ar generate:manifest";
        console.error(`ar: ${path} is out of date. Run \`${fix}\`.`);
        return 1;
      }
      console.log(`  ok      ${path} is up to date`);
      return 0;
    }
    console.log(changed ? `  write   ${path}` : `  ok      ${path} (unchanged)`);
    return 0;
  }
  if (command === "typecheck") {
    return delegateBin("@blazetrails/activerecord", "trails-tsc", rest);
  }
  if (command === "schema:dump") {
    return delegateBin("@blazetrails/activerecord", "trails-schema-dump", rest);
  }
  if (command === "models:dump") {
    return delegateBin("@blazetrails/activerecord", "trails-models-dump", rest);
  }
  if (NOT_IMPLEMENTED.has(command)) {
    console.error(`ar: "${command}" is not implemented in this slice yet.`);
    return 1;
  }
  console.error(`ar: unknown command "${command}". Run \`ar --help\`.`);
  return 1;
}
