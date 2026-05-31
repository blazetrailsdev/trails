import { getPathAsync } from "@blazetrails/activesupport";
import { init } from "./init.js";
import { generateManifest } from "./generate-manifest.js";
import { generateMigration, migrationTimestamp, parseFields } from "./generate-migration.js";
import { generateModel } from "./generate-model.js";
import { delegateBin } from "./delegate.js";
import { run as runSchemaDump } from "./bin/trails-schema-dump.js";
import { run as runModelsDump } from "./bin/trails-models-dump.js";
import {
  dbCreate,
  dbDrop,
  dbMigrate,
  dbRollback,
  dbSchemaLoad,
  dbSeed,
  dbSetup,
  dbReset,
  dbPrepare,
} from "./db-tasks.js";
import { dbAbortIfPendingMigrations } from "./pending-migrations.js";

const HELP = `ar — the CLI for standalone @blazetrails/activerecord projects

Usage: ar <command> [options]

Commands:
  init                           Scaffold config/database.ts, db/, app/models/, and db.ts
  generate:manifest              Scan app/models/ and (re)write app/models/index.ts
  generate:migration <Name>      Emit db/migrate/<ts>_<snake_name>.ts
  generate:model <Name>          Emit app/models/<snake>.ts + a create migration
  typecheck                      Type-check your models via trails-tsc
  schema:dump                    Dump the current schema via trails-schema-dump
  models:dump                    Dump model metadata via trails-models-dump
  db:create                      Create the database for the current TRAILS_ENV
  db:drop                        Drop the database for the current TRAILS_ENV
  db:migrate                     Run pending migrations
  db:rollback                    Roll back the last migration
  db:schema:load                 Load db/schema.ts into the database
  db:seed                        Load db/seeds.ts
  db:setup                       Create, load schema, and seed
  db:reset                       Drop, then db:setup
  db:prepare                     Idempotent setup (create if missing, migrate, seed)
  db:abort_if_pending_migrations Exit non-zero if there are pending migrations

Coming in later slices: db:migrate:status.

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

const DB_CREATE_HELP = `ar db:create — create the database for the current TRAILS_ENV

Loads config/database.ts, resolves the active environment (TRAILS_ENV →
NODE_ENV → "development"), and creates each configured database.

Options:
  --all   Create databases for all environments, not just the current one.`;

const DB_DROP_HELP = `ar db:drop — drop the database for the current TRAILS_ENV

Loads config/database.ts, resolves the active environment (TRAILS_ENV →
NODE_ENV → "development"), and drops each configured database.
Production environments are protected unless DISABLE_DATABASE_ENVIRONMENT_CHECK is set.

Options:
  --all   Drop databases for all environments, not just the current one.`;

const DB_MIGRATE_HELP = `ar db:migrate — run pending migrations

Options:
  --version <v>   Migrate to a specific version.`;

const DB_ROLLBACK_HELP = `ar db:rollback — roll back the last migration

Options:
  --step <n>   Roll back N migrations (default: 1).`;

const DB_SCHEMA_LOAD_HELP = `ar db:schema:load — load db/schema.ts into the database`;

const DB_SEED_HELP = `ar db:seed — load db/seeds.ts (no-op if file is absent)`;

const DB_SETUP_HELP = `ar db:setup — create the database, load the schema, and seed

Equivalent to db:create + db:schema:load + db:seed for the current TRAILS_ENV.`;

const DB_RESET_HELP = `ar db:reset — drop and recreate the database

Equivalent to db:drop + db:setup. Protected environments are checked before drop.`;

const DB_PREPARE_HELP = `ar db:prepare — idempotent database setup

Creates the database if it does not exist, runs pending migrations, and seeds
if the database was freshly created. Safe to run on an already-setup database.`;

const DB_ABORT_IF_PENDING_MIGRATIONS_HELP = `ar db:abort_if_pending_migrations — exit non-zero if any migrations are pending

Loads config/database.ts and the migration registry, then checks whether any
migrations have not yet been applied. If pending migrations exist, prints the
count and version list to stderr and exits 1. Exits 0 when all migrations are
up to date. Suitable for use as a pre-deploy health check.`;

const GENERATE_MIGRATION_HELP = `ar generate:migration <Name> [field:type ...] — emit a migration file

Creates db/migrate/<YYYYMMDDHHMMSS>_<snake_name>.ts. The migration class name is the
CamelCase form of <Name>. Name patterns trigger different templates:
  add_<cols>_to_<table>    → addColumn calls
  remove_<cols>_from_<tbl> → removeColumn calls
  create_<table>           → createTable block (same as generate:model)
  anything else            → change() body with a TODO comment

Options:
  --force      Overwrite if file already exists (default: refuse).
  --dry-run    Print the intended path without writing.`;

const GENERATE_MODEL_HELP = `ar generate:model <Name> [field:type ...] — emit a model + creation migration

Creates app/models/<snake_name>.ts (a Base subclass) and
db/migrate/<YYYYMMDDHHMMSS>_create_<plural_snake>.ts.

Options:
  --force      Overwrite if files already exist (default: refuse).
  --dry-run    Print the intended paths without writing.`;

/** Commands recognized but deferred to a later slice (see proposal §5). */
const NOT_IMPLEMENTED = new Set("db:migrate:status db:schema:dump".split(" "));

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
    return runSchemaDump(rest);
  }
  if (command === "models:dump") {
    return runModelsDump(rest);
  }
  if (command === "db:create") {
    if (wantsHelp(rest)) {
      console.log(DB_CREATE_HELP);
      return 0;
    }
    return dbCreate(cwd, rest);
  }
  if (command === "db:drop") {
    if (wantsHelp(rest)) {
      console.log(DB_DROP_HELP);
      return 0;
    }
    return dbDrop(cwd, rest);
  }
  if (command === "db:migrate") {
    if (wantsHelp(rest)) {
      console.log(DB_MIGRATE_HELP);
      return 0;
    }
    return dbMigrate(cwd, rest);
  }
  if (command === "db:rollback") {
    if (wantsHelp(rest)) {
      console.log(DB_ROLLBACK_HELP);
      return 0;
    }
    return dbRollback(cwd, rest);
  }
  if (command === "db:schema:load") {
    if (wantsHelp(rest)) {
      console.log(DB_SCHEMA_LOAD_HELP);
      return 0;
    }
    return dbSchemaLoad(cwd, rest);
  }
  if (command === "db:seed") {
    if (wantsHelp(rest)) {
      console.log(DB_SEED_HELP);
      return 0;
    }
    return dbSeed(cwd, rest);
  }
  if (command === "db:setup") {
    if (wantsHelp(rest)) {
      console.log(DB_SETUP_HELP);
      return 0;
    }
    return dbSetup(cwd, rest);
  }
  if (command === "db:reset") {
    if (wantsHelp(rest)) {
      console.log(DB_RESET_HELP);
      return 0;
    }
    return dbReset(cwd, rest);
  }
  if (command === "db:prepare") {
    if (wantsHelp(rest)) {
      console.log(DB_PREPARE_HELP);
      return 0;
    }
    return dbPrepare(cwd, rest);
  }
  if (command === "db:abort_if_pending_migrations") {
    if (wantsHelp(rest)) {
      console.log(DB_ABORT_IF_PENDING_MIGRATIONS_HELP);
      return 0;
    }
    return dbAbortIfPendingMigrations(cwd);
  }
  if (command === "generate:migration") {
    if (wantsHelp(rest)) {
      console.log(GENERATE_MIGRATION_HELP);
      return 0;
    }
    const [name, ...fieldTokens] = rest.filter((a) => !a.startsWith("-"));
    if (!name) {
      console.error("ar: generate:migration requires a migration name.");
      return 1;
    }
    const force = rest.includes("--force");
    const dryRun = rest.includes("--dry-run");
    const fields = parseFields(fieldTokens);
    const result = await generateMigration(cwd, name, fields, migrationTimestamp(), {
      force,
      dryRun,
    });
    if (result.skipped) {
      console.error(`ar: ${result.path} already exists. Use --force to overwrite.`);
      return 1;
    }
    const verb = dryRun ? "  (dry)   " : "  create  ";
    console.log(`${verb}${result.path}`);
    return 0;
  }
  if (command === "generate:model") {
    if (wantsHelp(rest)) {
      console.log(GENERATE_MODEL_HELP);
      return 0;
    }
    const [name, ...fieldTokens] = rest.filter((a) => !a.startsWith("-"));
    if (!name) {
      console.error("ar: generate:model requires a model name.");
      return 1;
    }
    const force = rest.includes("--force");
    const dryRun = rest.includes("--dry-run");
    const fields = parseFields(fieldTokens);
    const result = await generateModel(cwd, name, fields, migrationTimestamp(), { force, dryRun });
    if (result.skipped) {
      console.error(
        `ar: ${result.modelPath} or ${result.migrationPath} already exists. Use --force to overwrite.`,
      );
      return 1;
    }
    const verb = dryRun ? "  (dry)   " : "  create  ";
    console.log(`${verb}${result.modelPath}`);
    console.log(`${verb}${result.migrationPath}`);
    return 0;
  }
  if (NOT_IMPLEMENTED.has(command)) {
    console.error(`ar: "${command}" is not implemented in this slice yet.`);
    return 1;
  }
  console.error(`ar: unknown command "${command}". Run \`ar --help\`.`);
  return 1;
}
