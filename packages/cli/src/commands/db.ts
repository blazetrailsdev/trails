import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { loadDatabaseConfig, connectAdapter, type DatabaseConfig } from "../database.js";
import { discoverMigrations } from "../migration-loader.js";
import { Migrator } from "@rails-ts/activerecord";
import type { DatabaseAdapter } from "@rails-ts/activerecord";

/**
 * Build a config that connects to the system database (for CREATE/DROP DATABASE).
 * Handles both param-based and URL-based configs.
 */
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

export function dbCommand(): Command {
  const cmd = new Command("db");
  cmd.description("Database management commands");

  cmd
    .command("migrate")
    .description("Run pending migrations")
    .option("--version <version>", "Migrate to a specific version")
    .action(async (opts) => {
      const config = await loadDatabaseConfig();
      const adapter = await connectAdapter(config);
      try {
        const migrationsDir = path.join(process.cwd(), "db", "migrations");
        const migrations = await discoverMigrations(migrationsDir);

        if (migrations.length === 0) {
          console.log("No migrations found.");
          return;
        }

        const migrator = new Migrator(adapter, migrations);
        await migrator.migrate(opts.version ?? null);

        for (const line of migrator.output) {
          console.log(line);
        }

        const pending = await migrator.pendingMigrations();
        if (pending.length === 0) {
          console.log("All migrations are up to date.");
        }
      } finally {
        await closeAdapter(adapter);
      }
    });

  cmd
    .command("rollback")
    .description("Rollback migrations")
    .option("--step <n>", "Number of migrations to rollback", "1")
    .action(async (opts) => {
      const config = await loadDatabaseConfig();
      const adapter = await connectAdapter(config);
      try {
        const migrationsDir = path.join(process.cwd(), "db", "migrations");
        const migrations = await discoverMigrations(migrationsDir);

        if (migrations.length === 0) {
          console.log("No migrations found.");
          return;
        }

        const step = Number(opts.step);
        if (!Number.isInteger(step) || step < 1) {
          console.error(`Invalid value for --step: "${opts.step}". Expected a positive integer.`);
          process.exitCode = 1;
          return;
        }

        const migrator = new Migrator(adapter, migrations);
        await migrator.rollback(step);

        for (const line of migrator.output) {
          console.log(line);
        }
      } finally {
        await closeAdapter(adapter);
      }
    });

  cmd
    .command("seed")
    .description("Run database seeds")
    .action(async () => {
      const seedCandidates = [
        path.join(process.cwd(), "db", "seeds.ts"),
        path.join(process.cwd(), "db", "seeds.js"),
      ];
      const seedFile = seedCandidates.find((f) => fs.existsSync(f));
      if (!seedFile) {
        console.log("No seeds file found at db/seeds.ts or db/seeds.js");
        return;
      }

      const config = await loadDatabaseConfig();
      const adapter = await connectAdapter(config);
      try {
        // Set adapter on Base so models can query during seeding
        const { Base } = await import("@rails-ts/activerecord");
        Base.adapter = adapter;

        console.log("Running seeds...");
        await import(pathToFileURL(seedFile).href);
        console.log("Seeds completed.");
      } finally {
        await closeAdapter(adapter);
      }
    });

  cmd
    .command("create")
    .description("Create the database")
    .action(async () => {
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
        const dbName = config.database;
        if (!dbName && !config.url) {
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
    });

  cmd
    .command("drop")
    .description("Drop the database")
    .action(async () => {
      const config = await loadDatabaseConfig();
      const adapterName = config.adapter ?? "sqlite3";

      if (adapterName === "sqlite3" || adapterName === "sqlite") {
        const dbPath = config.database;
        if (dbPath && dbPath !== ":memory:" && fs.existsSync(dbPath)) {
          fs.unlinkSync(dbPath);
          console.log(`Dropped database '${dbPath}'`);
        }
      } else {
        const dbName = config.database;
        if (!dbName && !config.url) {
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
    });

  cmd
    .command("migrate:status")
    .description("Show migration status")
    .action(async () => {
      const config = await loadDatabaseConfig();
      const adapter = await connectAdapter(config);
      try {
        const migrationsDir = path.join(process.cwd(), "db", "migrations");
        const migrations = await discoverMigrations(migrationsDir);

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
      } finally {
        await closeAdapter(adapter);
      }
    });

  return cmd;
}
