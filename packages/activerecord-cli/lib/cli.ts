import { File } from "@blazetrails/ruby-compat/file";
import { include } from "@blazetrails/ruby-compat/include";
import { setEnv } from "@blazetrails/ruby-compat/process-adapter";
import { getEnv, isBlank } from "@blazetrails/activesupport";
import { Thor, type ThorClass } from "@blazetrails/thor";
import { Actions } from "@blazetrails/thor/actions";
import { HELP_MAPPINGS, type Base as ThorBase, type BaseConfig } from "@blazetrails/thor/base";
import { Error as ThorError } from "@blazetrails/thor/error";
import { Base as ShellBase } from "@blazetrails/thor/shell";
import type { Basic } from "@blazetrails/thor/shell/basic";
import { init, detectPackageManager } from "./init.js";
import { generateManifest } from "./generate-manifest.js";
import { generateMigration, migrationTimestamp, parseFields } from "./generate-migration.js";
import { generateModel } from "./generate-model.js";
import { destroyMigration, destroyModel } from "./destroy.js";
import { delegateBin } from "./delegate.js";
import { run as runModelsDump } from "./bin/trails-models-dump.js";
import {
  dbCreate,
  dbDrop,
  dbMigrate,
  dbRollback,
  dbSchemaDump,
  dbSchemaLoad,
  dbSeed,
  dbSetup,
  dbReset,
  dbPrepare,
  dbMigrateStatus,
  dbVersion,
} from "./db-tasks.js";
import { dbAbortIfPendingMigrations } from "./pending-migrations.js";
import { arConsole } from "./console.js";
import { arRunner } from "./runner.js";
import { arNew, parseDriver } from "./new.js";

const DRIVER_OPTION = {
  type: "string",
  desc: "Database driver: better-sqlite3 (default), node-sqlite, pg, mysql2.",
} as const;

/** @noRailsEquivalent PERMANENT */
export class Cli extends Thor {
  declare options: ThorBase["options"];
  declare destinationRoot: string;
  declare shell: Basic;

  static {
    const klass = this as unknown as ThorClass;

    klass.map({
      "generate:manifest": "generateManifest",
      "generate:migration": "generateMigration",
      "generate:model": "generateModel",
      "destroy:migration": "destroyMigration",
      "destroy:model": "destroyModel",
      "models:dump": "modelsDump",
      "db:create": "dbCreate",
      "db:drop": "dbDrop",
      "db:migrate": "dbMigrate",
      "db:migrate:status": "dbMigrateStatus",
      "db:version": "dbVersion",
      "db:rollback": "dbRollback",
      "db:schema:dump": "dbSchemaDump",
      "db:schema:load": "dbSchemaLoad",
      "db:seed": "dbSeed",
      "db:setup": "dbSetup",
      "db:reset": "dbReset",
      "db:prepare": "dbPrepare",
      "db:abort_if_pending_migrations": "dbAbortIfPendingMigrations",
    });
    klass.stopOnUnknownOptionBang("typecheck", "modelsDump", "runner");

    klass.desc("new APP_NAME", "Create a new directory and scaffold a standalone AR project");
    klass.longDesc(
      `Creates ./<app-name>/, writes package.json, tsconfig.json, .gitignore, and
runs the same scaffolding as \`ar init\` inside the new directory. Does NOT
run \`pnpm install\` or \`git init\` — prints the next-step commands instead.`,
      { wrap: false },
    );
    klass.methodOption("driver", DRIVER_OPTION);
    klass.methodOption("force", {
      type: "boolean",
      desc: "Overwrite if the directory already exists.",
    });
    klass.methodAdded("new");

    klass.desc("init", "Scaffold config/database.ts, db/, app/models/, and db.ts");
    klass.longDesc(
      `Run in an existing project root to add @blazetrails/activerecord to it — scaffold a standalone
activerecord project. Writes (or updates) package.json, tsconfig.json, config/database.ts
(TRAILS_ENV-keyed), db/migrate/, db/seeds.ts, app/models/, .trails/models/index.ts (the
generated, gitignored manifest), and db.ts (bootstrap glue). Does NOT write .gitignore —
bring your own, ignoring .trails/. If a tsconfig.json already exists, AR-required settings
are merged in (JSONC-aware); conflicting keys are preserved and reported as warnings.
Existing scaffold files are skipped by default.`,
      { wrap: false },
    );
    klass.methodOption("driver", DRIVER_OPTION);
    klass.methodOption("force", {
      type: "boolean",
      desc: "Overwrite all existing scaffold files, including tsconfig.json.",
    });
    klass.methodAdded("init");

    klass.desc("generate:manifest", "Scan app/models/ and (re)write .trails/models/index.ts");
    klass.longDesc(
      `Scans the models directory for exported classes that (transitively) extend
\`Base\` and rewrites the registration manifest in stable alphabetical order.
Idempotent: a second run is a no-op.

The manifest is build output under .trails/ — gitignore it, don't commit it.`,
      { wrap: false },
    );
    klass.methodOption("root", {
      type: "string",
      desc: "Directory to scan (default: ./app/models)",
      lazyDefault: "",
    });
    klass.methodAdded("generateManifest");

    klass.desc("generate:migration NAME [field:type ...]", "Emit db/migrate/<ts>_<snake_name>.ts");
    klass.longDesc(
      `Creates db/migrate/<YYYYMMDDHHMMSS>_<snake_name>.ts. The migration class name is the
CamelCase form of <Name>. Name patterns trigger different templates:
  add_<cols>_to_<table>    → addColumn calls
  remove_<cols>_from_<tbl> → removeColumn calls
  create_<table>           → createTable block (same as generate:model)
  anything else            → change() body with a TODO comment`,
      { wrap: false },
    );
    klass.methodOption("force", {
      type: "boolean",
      desc: "Overwrite if file already exists (default: refuse).",
    });
    klass.methodOption("dry_run", {
      type: "boolean",
      desc: "Print the intended path without writing.",
    });
    klass.methodAdded("generateMigration");

    klass.desc(
      "generate:model NAME [field:type ...]",
      "Emit app/models/<snake>.ts + a create migration",
    );
    klass.longDesc(
      `Creates app/models/<snake_name>.ts (a Base subclass) and
db/migrate/<YYYYMMDDHHMMSS>_create_<plural_snake>.ts.`,
      { wrap: false },
    );
    klass.methodOption("force", {
      type: "boolean",
      desc: "Overwrite if files already exist (default: refuse).",
    });
    klass.methodOption("dry_run", {
      type: "boolean",
      desc: "Print the intended paths without writing.",
    });
    klass.methodAdded("generateModel");

    klass.desc(
      "destroy:migration NAME [field:type ...]",
      "Delete the matching db/migrate/*_<snake_name>.ts",
    );
    klass.longDesc(
      `Finds db/migrate/*_<snake_name>.ts and deletes it. Errors if multiple match.
Refuses when the file differs from the template.`,
      { wrap: false },
    );
    klass.methodOption("force", { type: "boolean", desc: "Delete even if hand-modified." });
    klass.methodOption("dry_run", { type: "boolean", desc: "Print without deleting." });
    klass.methodAdded("destroyMigration");

    klass.desc(
      "destroy:model NAME [field:type ...]",
      "Delete app/models/<snake>.ts + its create migration",
    );
    klass.longDesc(
      `Deletes app/models/<snake_name>.ts and the matching create migration, then
re-runs generate:manifest. Refuses when a file differs from the template.`,
      { wrap: false },
    );
    klass.methodOption("force", { type: "boolean", desc: "Delete even if hand-modified." });
    klass.methodOption("dry_run", { type: "boolean", desc: "Print without deleting." });
    klass.methodAdded("destroyModel");

    klass.desc("typecheck [ARGS...]", "Type-check your models via trails-tsc");
    klass.methodAdded("typecheck");

    klass.desc(
      "models:dump [ARGS...]",
      "Dump models from db/schema.ts (run ar db:schema:dump first)",
    );
    klass.methodAdded("modelsDump");

    klass.desc("db:create", "Create the database for the current TRAILS_ENV");
    klass.longDesc(
      `Loads config/database.ts, resolves the active environment (TRAILS_ENV →
NODE_ENV → "development"), and creates each configured database.
Pass --all to create databases for all environments, not just the current one.`,
      { wrap: false },
    );
    klass.methodAdded("dbCreate");

    klass.desc("db:drop", "Drop the database for the current TRAILS_ENV");
    klass.longDesc(
      `Loads config/database.ts, resolves the active environment (TRAILS_ENV →
NODE_ENV → "development"), and drops each configured database.
Production environments are protected unless DISABLE_DATABASE_ENVIRONMENT_CHECK is set.
Pass --all to drop databases for all environments, not just the current one.`,
      { wrap: false },
    );
    klass.methodAdded("dbDrop");

    klass.desc("db:migrate", "Run pending migrations");
    klass.longDesc("Pass --version <v> to migrate to a specific version.");
    klass.methodAdded("dbMigrate");

    klass.desc("db:migrate:status", "Show up/down status for each migration");
    klass.longDesc("Pass --all to show status for all configured databases.");
    klass.methodAdded("dbMigrateStatus");

    klass.desc("db:version", "Print the current schema version");
    klass.longDesc(
      `Connects to the database for the current TRAILS_ENV and prints the highest
applied migration version. Prints "Current version: 0" when no migrations have
been run or the schema_migrations table does not yet exist.
Pass --all for all configured databases, or --env <name> to override TRAILS_ENV.`,
      { wrap: false },
    );
    klass.methodAdded("dbVersion");

    klass.desc("db:rollback", "Roll back the last migration");
    klass.longDesc("Pass --step <n> to roll back N migrations (default: 1).");
    klass.methodAdded("dbRollback");

    klass.desc("db:schema:dump", "Dump the current database schema to db/schema.ts");
    klass.methodAdded("dbSchemaDump");

    klass.desc("db:schema:load", "Load db/schema.ts into the database");
    klass.methodAdded("dbSchemaLoad");

    klass.desc("db:seed", "Load db/seeds.ts");
    klass.longDesc("Load db/seeds.ts (no-op if file is absent).");
    klass.methodAdded("dbSeed");

    klass.desc("db:setup", "Create, load schema, and seed");
    klass.longDesc(
      "Equivalent to db:create + db:schema:load + db:seed for the current TRAILS_ENV.",
    );
    klass.methodAdded("dbSetup");

    klass.desc("db:reset", "Drop, then db:setup");
    klass.longDesc(
      "Equivalent to db:drop + db:setup. Protected environments are checked before drop.",
    );
    klass.methodAdded("dbReset");

    klass.desc("db:prepare", "Idempotent setup (create if missing, migrate, seed)");
    klass.longDesc(
      `Creates the database if it does not exist, runs pending migrations, and seeds
if the database was freshly created. Safe to run on an already-setup database.`,
      { wrap: false },
    );
    klass.methodAdded("dbPrepare");

    klass.desc("db:abort_if_pending_migrations", "Exit non-zero if there are pending migrations");
    klass.longDesc(
      `Loads config/database.ts and the migration registry, then checks whether any
migrations have not yet been applied. If pending migrations exist, prints the
count and version list to stderr and exits 1. Exits 0 when all migrations are
up to date. Suitable for use as a pre-deploy health check.`,
      { wrap: false },
    );
    klass.methodAdded("dbAbortIfPendingMigrations");

    klass.desc("console", "Launch a REPL with Base + models pre-loaded");
    klass.longDesc(
      `REPL with Base + app/models pre-loaded. Prompt: "trails> ".
Pass --env <name> to override TRAILS_ENV for this session.`,
      { wrap: false },
    );
    klass.methodAdded("console");

    klass.desc(
      "runner SCRIPT [ARGS...]",
      "Run a script with models registered + connection established",
    );
    klass.longDesc(
      `.trails/models/index.ts is imported (side-effect: models registered for AR queries).
Remaining args: __ARGV__. Pass --env <name> to override TRAILS_ENV for this invocation.`,
      { wrap: false },
    );
    klass.methodAdded("runner");
  }

  static isExitOnFailure(): boolean {
    return false;
  }

  static perform(
    command: string | null,
    args: (string | null)[],
    config: BaseConfig,
  ): Promise<unknown> {
    if (HELP_MAPPINGS.includes(args[0] as string)) {
      [command, args] = ["help", [command]];
    }

    return (this as unknown as ThorClass).dispatch(command, [...args], null, config);
  }

  async help(command: string | null = null, subcommand: unknown = false): Promise<void> {
    await super.help(command, subcommand);
    if (command === "models:dump") {
      this.shell.say("");
      await runModelsDump(["--help"]);
    } else if (command === "typecheck") {
      this.shell.say("");
      delegateBin("@blazetrails/activerecord-cli", "trails-tsc", ["--help"]);
    }
  }

  async new(appName: string): Promise<number> {
    const driver = parseDriver((this.options.driver as string | null) ?? undefined);
    if (driver === null) {
      throw new ThorError(
        `ar: unknown driver "${String(this.options.driver)}". Valid options: better-sqlite3, node-sqlite, pg, mysql2.`,
      );
    }
    const result = await arNew(this.destinationRoot, appName, driver, {
      force: this.options.force === true,
    });
    for (const rel of result.created) console.log(`  create  ${appName}/${rel}`);
    for (const rel of result.skipped) console.log(`  skip    ${appName}/${rel} (already exists)`);
    console.log(`\nScaffolded ${result.created.length} file(s) in ${result.appDir}.`);
    console.log("\nNext steps:");
    console.log(`  cd ${appName}`);
    console.log("  pnpm install    # or: npm install");
    console.log("  git init && git add -A && git commit -m 'Initial commit'");
    console.log("  ar db:create");
    return 0;
  }

  async init(): Promise<number> {
    const cwd = this.destinationRoot;
    const driver = parseDriver((this.options.driver as string | null) ?? undefined);
    if (driver === null) {
      throw new ThorError(
        `ar: unknown driver "${String(this.options.driver)}". Valid options: better-sqlite3, node-sqlite, pg, mysql2.`,
      );
    }
    const { created, skipped, packageJsonUpdated, tsconfigMerged } = await init(cwd, {
      force: this.options.force === true,
      driver,
    });
    for (const rel of created) console.log(`  create  ${rel}`);
    for (const rel of skipped) console.log(`  skip    ${rel} (already exists)`);
    if (packageJsonUpdated) {
      if (packageJsonUpdated.added.length > 0) {
        const alreadyNote =
          packageJsonUpdated.alreadyPresent.length > 0
            ? ` (${packageJsonUpdated.alreadyPresent.join(", ")} already present)`
            : "";
        console.log(
          `  update  package.json: added ${packageJsonUpdated.added.join(", ")}${alreadyNote}`,
        );
      } else {
        console.log(`  skip    package.json (activerecord deps already present)`);
      }
    }
    if (tsconfigMerged) {
      if (tsconfigMerged.changed) {
        const parts: string[] = [];
        if (tsconfigMerged.added.length > 0) parts.push(`added ${tsconfigMerged.added.join(", ")}`);
        if (tsconfigMerged.pluginAdded) parts.push("added trails-tsc plugin");
        if (tsconfigMerged.includesAppended.length > 0)
          parts.push(`appended include globs: ${tsconfigMerged.includesAppended.join(", ")}`);
        console.log(`  update  tsconfig.json: ${parts.join("; ")}`);
      } else if (tsconfigMerged.conflicts.length === 0) {
        console.log(`  skip    tsconfig.json (already compliant)`);
      }
      if (tsconfigMerged.conflicts.length > 0) {
        console.log(`  warn    tsconfig.json has conflicting settings (resolve manually):`);
        for (const { key, existing, required } of tsconfigMerged.conflicts) {
          console.log(
            `            ${key}: found ${JSON.stringify(existing)}, expected ${JSON.stringify(required)}`,
          );
        }
      }
    }
    console.log(
      `\nScaffolded ${created.length} file(s)${skipped.length ? `, skipped ${skipped.length}` : ""}.`,
    );
    const pm = await detectPackageManager(cwd);
    const installCmd =
      pm === "pnpm"
        ? "pnpm install"
        : pm === "yarn"
          ? "yarn"
          : pm === "bun"
            ? "bun install"
            : "npm install";
    console.log("\nNext steps:");
    console.log(`  ${installCmd}`);
    console.log("  ar generate:manifest");
    console.log("  ar db:create");
    console.log("  ar db:migrate");
    return 0;
  }

  async generateManifest(): Promise<number> {
    const cwd = this.destinationRoot;
    if (this.options.root === "") throw new ThorError("--root requires a directory argument.");
    const modelsDir = File.expandPath((this.options.root as string | null) ?? "app/models", cwd);
    const { path, changed } = await generateManifest(modelsDir, cwd);
    console.log(changed ? `  write   ${path}` : `  ok      ${path} (unchanged)`);
    return 0;
  }

  async generateMigration(name: string, ...fieldTokens: string[]): Promise<number> {
    const dryRun = this.options.dry_run === true;
    const result = await generateMigration(
      this.destinationRoot,
      name,
      parseFields(fieldTokens),
      migrationTimestamp(),
      { force: this.options.force === true, dryRun },
    );
    if (result.skipped) {
      console.error(`ar: ${result.path} already exists. Use --force to overwrite.`);
      return 1;
    }
    const verb = dryRun ? "  (dry)   " : "  create  ";
    console.log(`${verb}${result.path}`);
    return 0;
  }

  async generateModel(name: string, ...fieldTokens: string[]): Promise<number> {
    const dryRun = this.options.dry_run === true;
    const result = await generateModel(
      this.destinationRoot,
      name,
      parseFields(fieldTokens),
      migrationTimestamp(),
      { force: this.options.force === true, dryRun },
    );
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

  async destroyMigration(name: string, ...fieldTokens: string[]): Promise<number> {
    const dryRun = this.options.dry_run === true;
    const result = await destroyMigration(this.destinationRoot, name, parseFields(fieldTokens), {
      force: this.options.force === true,
      dryRun,
    });
    if (result.ambiguous) {
      console.error(
        `ar: multiple migrations match — delete manually:\n${result.ambiguous.map((p) => `  ${p}`).join("\n")}`,
      );
      return 1;
    }
    if (result.modified !== undefined) {
      console.error(
        `ar: ${result.path} was modified. Use --force to delete anyway.\n${result.modified}`,
      );
      return 1;
    }
    if (!result.deleted) {
      console.error(`ar: no migration found matching ${result.path}.`);
      return 1;
    }
    const verb = dryRun ? "  (dry)   " : "  remove  ";
    console.log(`${verb}${result.path}`);
    return 0;
  }

  async destroyModel(name: string, ...fieldTokens: string[]): Promise<number> {
    const dryRun = this.options.dry_run === true;
    const result = await destroyModel(this.destinationRoot, name, parseFields(fieldTokens), {
      force: this.options.force === true,
      dryRun,
    });
    if (result.ambiguous) {
      console.error(
        `ar: multiple create migrations match — delete manually:\n${result.ambiguous.map((p) => `  ${p}`).join("\n")}`,
      );
      return 1;
    }
    if (result.modified !== undefined) {
      console.error(`ar: file was modified. Use --force to delete anyway.\n${result.modified}`);
      return 1;
    }
    if (!result.deleted) {
      console.error(`ar: no model or migration found for ${result.modelPath}.`);
      return 1;
    }
    const verb = dryRun ? "  (dry)   " : "  remove  ";
    if (result.modelDeleted) console.log(`${verb}${result.modelPath}`);
    if (result.migrationPath) console.log(`${verb}${result.migrationPath}`);
    return 0;
  }

  typecheck(...args: string[]): number {
    return delegateBin("@blazetrails/activerecord-cli", "trails-tsc", args);
  }

  modelsDump(...args: string[]): Promise<number> {
    return runModelsDump(args);
  }

  dbCreate(...args: string[]): Promise<number> {
    return dbCreate(this.destinationRoot, args);
  }

  dbDrop(...args: string[]): Promise<number> {
    return dbDrop(this.destinationRoot, args);
  }

  dbMigrate(...args: string[]): Promise<number> {
    return dbMigrate(this.destinationRoot, args);
  }

  dbMigrateStatus(...args: string[]): Promise<number> {
    return dbMigrateStatus(this.destinationRoot, args);
  }

  dbVersion(...args: string[]): Promise<number> {
    return dbVersion(this.destinationRoot, args);
  }

  dbRollback(...args: string[]): Promise<number> {
    return dbRollback(this.destinationRoot, args);
  }

  dbSchemaDump(...args: string[]): Promise<number> {
    return dbSchemaDump(this.destinationRoot, args);
  }

  dbSchemaLoad(...args: string[]): Promise<number> {
    return dbSchemaLoad(this.destinationRoot, args);
  }

  dbSeed(...args: string[]): Promise<number> {
    return dbSeed(this.destinationRoot, args);
  }

  dbSetup(...args: string[]): Promise<number> {
    return dbSetup(this.destinationRoot, args);
  }

  dbReset(...args: string[]): Promise<number> {
    return dbReset(this.destinationRoot, args);
  }

  dbPrepare(...args: string[]): Promise<number> {
    return dbPrepare(this.destinationRoot, args);
  }

  dbAbortIfPendingMigrations(): Promise<number> {
    return dbAbortIfPendingMigrations(this.destinationRoot);
  }

  console(...args: string[]): Promise<number> {
    return arConsole(this.destinationRoot, args);
  }

  runner(...args: string[]): Promise<number> {
    return arRunner(this.destinationRoot, args);
  }
}

include(Cli, Actions);

/** @noRailsEquivalent PERMANENT */
export async function run(argv: string[], cwd: string): Promise<number> {
  if (isBlank(getEnv("TRAILS_ENV")) && isBlank(getEnv("NODE_ENV"))) {
    setEnv("TRAILS_ENV", "development");
  }
  const [command = null, ...args] = argv;
  const config: BaseConfig = { destinationRoot: cwd, shell: new ShellBase.shell() };
  try {
    const result = await Cli.perform(command, args, config);
    return typeof result === "number" ? result : 0;
  } catch (e) {
    if (!(e instanceof ThorError)) throw e;
    config.shell!.error(e.message);
    return 1;
  }
}
