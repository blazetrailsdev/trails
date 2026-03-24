import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { loadDatabaseConfig, connectAdapter, type DatabaseConfig } from "../database.js";
import { discoverMigrations } from "../migration-loader.js";
import { Migrator, SchemaDumper } from "@rails-ts/activerecord";
import type { DatabaseAdapter } from "@rails-ts/activerecord";
import { AdapterSchemaSource } from "../schema-source.js";

// --- Helpers ---

function buildSystemConfig(
  config: DatabaseConfig,
  adapterName: string,
): { systemConfig: DatabaseConfig; dbNameResolved: string } {
  const isMysql = adapterName === "mysql2" || adapterName === "mysql";
  const systemDb = isMysql ? undefined : "postgres";

  if (config.url) {
    const parsed = new URL(config.url);
    const dbNameResolved = parsed.pathname.replace(/^\//, "");
    if (!dbNameResolved) {
      throw new Error(
        `Could not extract database name from URL. Ensure the URL includes a database path.`,
      );
    }
    parsed.pathname = isMysql ? "/" : "/postgres";
    return {
      systemConfig: { ...config, url: parsed.toString(), database: systemDb },
      dbNameResolved,
    };
  }

  const dbNameResolved = config.database!;
  return {
    systemConfig: { ...config, url: undefined, database: systemDb },
    dbNameResolved,
  };
}

const VALID_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_-]*$/;

function validateDbName(name: string): void {
  if (!VALID_IDENTIFIER.test(name)) {
    throw new Error(`Invalid database name "${name}". Names must match ${VALID_IDENTIFIER}.`);
  }
}

async function closeAdapter(adapter: DatabaseAdapter): Promise<void> {
  if (typeof (adapter as any).close === "function") {
    await (adapter as any).close();
  }
}

async function withAdapter(fn: (adapter: DatabaseAdapter) => Promise<void>): Promise<void> {
  const config = await loadDatabaseConfig();
  const adapter = await connectAdapter(config);
  try {
    await fn(adapter);
  } finally {
    await closeAdapter(adapter);
  }
}

function migrationsDir(): string {
  return path.join(process.cwd(), "db", "migrations");
}

async function runMigrate(adapter: DatabaseAdapter, targetVersion?: string): Promise<void> {
  const migrations = await discoverMigrations(migrationsDir());
  if (migrations.length === 0) {
    console.log("No migrations found.");
    return;
  }

  const migrator = new Migrator(adapter, migrations);
  await migrator.migrate(targetVersion ?? null);

  for (const line of migrator.output) {
    console.log(line);
  }

  const pending = await migrator.pendingMigrations();
  if (pending.length === 0) {
    console.log("All migrations are up to date.");
  }
}

async function runRollback(adapter: DatabaseAdapter, steps: number): Promise<void> {
  const migrations = await discoverMigrations(migrationsDir());
  if (migrations.length === 0) {
    console.log("No migrations found.");
    return;
  }

  const migrator = new Migrator(adapter, migrations);
  await migrator.rollback(steps);

  for (const line of migrator.output) {
    console.log(line);
  }
}

async function runSeed(): Promise<void> {
  const seedCandidates = [
    path.join(process.cwd(), "db", "seeds.ts"),
    path.join(process.cwd(), "db", "seeds.js"),
  ];
  const seedFile = seedCandidates.find((f) => fs.existsSync(f));
  if (!seedFile) {
    console.log("No seeds file found at db/seeds.ts or db/seeds.js");
    return;
  }

  console.log("Running seeds...");
  await import(pathToFileURL(seedFile).href);
  console.log("Seeds completed.");
}

async function runCreate(): Promise<void> {
  const config = await loadDatabaseConfig();
  const adapterName = config.adapter ?? "sqlite3";

  if (adapterName === "sqlite3" || adapterName === "sqlite") {
    const dbPath = config.database;
    if (dbPath && dbPath !== ":memory:") {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, "");
      }
      console.log(`Created database '${dbPath}'`);
    }
  } else {
    if (!config.database && !config.url) {
      throw new Error(
        `No database name specified in config for adapter "${adapterName}". Set the "database" property.`,
      );
    }
    const { systemConfig, dbNameResolved } = buildSystemConfig(config, adapterName);
    validateDbName(dbNameResolved);
    const systemAdapter = await connectAdapter(systemConfig);
    try {
      await systemAdapter.executeMutation(`CREATE DATABASE "${dbNameResolved}"`);
      console.log(`Created database '${dbNameResolved}'`);
    } finally {
      await closeAdapter(systemAdapter);
    }
  }
}

async function runDrop(): Promise<void> {
  const config = await loadDatabaseConfig();
  const adapterName = config.adapter ?? "sqlite3";

  if (adapterName === "sqlite3" || adapterName === "sqlite") {
    const dbPath = config.database;
    if (dbPath && dbPath !== ":memory:" && fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log(`Dropped database '${dbPath}'`);
    }
  } else {
    if (!config.database && !config.url) {
      throw new Error(
        `No database name specified in config for adapter "${adapterName}". Set the "database" property.`,
      );
    }
    const { systemConfig, dbNameResolved } = buildSystemConfig(config, adapterName);
    validateDbName(dbNameResolved);
    const systemAdapter = await connectAdapter(systemConfig);
    try {
      await systemAdapter.executeMutation(`DROP DATABASE IF EXISTS "${dbNameResolved}"`);
      console.log(`Dropped database '${dbNameResolved}'`);
    } finally {
      await closeAdapter(systemAdapter);
    }
  }
}

// --- Command definitions ---

export function dbCommand(): Command {
  const cmd = new Command("db");
  cmd.description("Database management commands");

  cmd
    .command("migrate")
    .description("Run pending migrations")
    .option("--version <version>", "Migrate to a specific version")
    .action(async (opts) => {
      await withAdapter((adapter) => runMigrate(adapter, opts.version));
    });

  cmd
    .command("rollback")
    .description("Rollback migrations")
    .option("--step <n>", "Number of migrations to rollback", "1")
    .action(async (opts) => {
      const step = Number(opts.step);
      if (!Number.isInteger(step) || step < 1) {
        console.error(`Invalid value for --step: "${opts.step}". Expected a positive integer.`);
        process.exitCode = 1;
        return;
      }
      await withAdapter((adapter) => runRollback(adapter, step));
    });

  cmd
    .command("seed")
    .description("Run database seeds")
    .action(async () => {
      await withAdapter(async (adapter) => {
        const { Base } = await import("@rails-ts/activerecord");
        Base.adapter = adapter;
        await runSeed();
      });
    });

  cmd.command("create").description("Create the database").action(runCreate);

  cmd.command("drop").description("Drop the database").action(runDrop);

  cmd
    .command("migrate:status")
    .description("Show migration status")
    .action(async () => {
      await withAdapter(async (adapter) => {
        const migrations = await discoverMigrations(migrationsDir());
        if (migrations.length === 0) {
          console.log("No migrations found.");
          return;
        }

        const migrator = new Migrator(adapter, migrations);
        const statuses = await migrator.migrationsStatus();

        console.log("");
        console.log(" Status   Migration ID    Migration Name");
        console.log("--------------------------------------------------");
        for (const s of statuses) {
          const statusStr = s.status === "up" ? "  up  " : " down ";
          console.log(`${statusStr}   ${s.version.padEnd(16)}${s.name}`);
        }
        console.log("");
      });
    });

  cmd
    .command("migrate:redo")
    .description("Rollback and re-run the last migration")
    .option("--step <n>", "Number of migrations to redo", "1")
    .action(async (opts) => {
      const step = Number(opts.step);
      if (!Number.isInteger(step) || step < 1) {
        console.error(`Invalid value for --step: "${opts.step}". Expected a positive integer.`);
        process.exitCode = 1;
        return;
      }
      await withAdapter(async (adapter) => {
        await runRollback(adapter, step);
        await runMigrate(adapter);
      });
    });

  cmd
    .command("reset")
    .description("Drop, create, migrate, and seed the database")
    .action(async () => {
      await runDrop();
      await runCreate();
      await withAdapter(async (adapter) => {
        await runMigrate(adapter);
        const { Base } = await import("@rails-ts/activerecord");
        Base.adapter = adapter;
        await runSeed();
      });
    });

  cmd
    .command("setup")
    .description("Create, migrate, and seed the database")
    .action(async () => {
      await runCreate();
      await withAdapter(async (adapter) => {
        await runMigrate(adapter);
        const { Base } = await import("@rails-ts/activerecord");
        Base.adapter = adapter;
        await runSeed();
      });
    });

  cmd
    .command("schema:dump")
    .description("Dump the current database schema to db/schema.ts")
    .action(async () => {
      await withAdapter(async (adapter) => {
        const source = new AdapterSchemaSource(adapter);
        const output = await SchemaDumper.dump(source);
        const schemaPath = path.join(process.cwd(), "db", "schema.ts");
        fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
        fs.writeFileSync(schemaPath, output);
        console.log(`Schema dumped to ${schemaPath}`);
      });
    });

  cmd
    .command("schema:load")
    .description("Load the schema from db/schema.ts into the database")
    .action(async () => {
      const schemaCandidates = [
        path.join(process.cwd(), "db", "schema.ts"),
        path.join(process.cwd(), "db", "schema.js"),
      ];
      const schemaFile = schemaCandidates.find((f) => fs.existsSync(f));
      if (!schemaFile) {
        console.error("No schema file found at db/schema.ts or db/schema.js");
        process.exitCode = 1;
        return;
      }

      await withAdapter(async (adapter) => {
        const { MigrationContext } = await import("@rails-ts/activerecord");
        const ctx = new MigrationContext(adapter);
        let mod: any;
        try {
          mod = await import(pathToFileURL(schemaFile).href);
        } catch (error: any) {
          if (schemaFile.endsWith(".ts")) {
            const enhanced = new Error(
              `Failed to load schema file "${schemaFile}". ` +
                `Ensure a TypeScript loader (tsx, ts-node) is configured, ` +
                `or use a compiled db/schema.js instead.`,
            );
            (enhanced as any).cause = error;
            throw enhanced;
          }
          throw error;
        }
        const defineSchema = mod.default ?? mod;
        if (typeof defineSchema !== "function") {
          throw new Error(`Schema file must export a default function, got ${typeof defineSchema}`);
        }
        console.log("Loading schema...");
        await defineSchema(ctx);
        console.log("Schema loaded.");
      });
    });

  return cmd;
}
