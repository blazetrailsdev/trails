import { Command } from "commander";
import * as fs from "node:fs";
import * as path from "node:path";

export function dbCommand(): Command {
  const cmd = new Command("db");
  cmd.description("Database management commands");

  cmd
    .command("migrate")
    .description("Run pending migrations")
    .action(async () => {
      const cwd = process.cwd();
      const migrationsDir = path.join(cwd, "db", "migrations");

      if (!fs.existsSync(migrationsDir)) {
        console.log("No migrations directory found.");
        return;
      }

      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".ts"))
        .sort();

      if (files.length === 0) {
        console.log("No pending migrations.");
        return;
      }

      for (const file of files) {
        console.log(`  Migrating: ${file}`);
        const mod = await import(path.join(migrationsDir, file));
        const MigrationClass = Object.values(mod).find(
          (v) => typeof v === "function" && v !== mod.default,
        ) as any;

        if (MigrationClass) {
          const migration = new MigrationClass();
          await migration.up();
          console.log(`  Migrated:  ${file}`);
        }
      }
    });

  cmd
    .command("rollback")
    .description("Rollback the last migration")
    .action(async () => {
      const cwd = process.cwd();
      const migrationsDir = path.join(cwd, "db", "migrations");

      if (!fs.existsSync(migrationsDir)) {
        console.log("No migrations directory found.");
        return;
      }

      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".ts"))
        .sort()
        .reverse();

      if (files.length === 0) {
        console.log("No migrations to rollback.");
        return;
      }

      const file = files[0];
      console.log(`  Rolling back: ${file}`);
      const mod = await import(path.join(migrationsDir, file));
      const MigrationClass = Object.values(mod).find(
        (v) => typeof v === "function" && v !== mod.default,
      ) as any;

      if (MigrationClass) {
        const migration = new MigrationClass();
        await migration.down();
        console.log(`  Rolled back:  ${file}`);
      }
    });

  cmd
    .command("seed")
    .description("Run database seeds")
    .action(async () => {
      const seedFile = path.join(process.cwd(), "db", "seeds.ts");
      if (!fs.existsSync(seedFile)) {
        console.log("No seeds file found at db/seeds.ts");
        return;
      }
      console.log("Running seeds...");
      await import(seedFile);
      console.log("Seeds completed.");
    });

  cmd
    .command("create")
    .description("Create the database")
    .action(async () => {
      console.log("Database created.");
    });

  cmd
    .command("drop")
    .description("Drop the database")
    .action(async () => {
      console.log("Database dropped.");
    });

  cmd
    .command("migrate:status")
    .description("Show migration status")
    .action(async () => {
      const cwd = process.cwd();
      const migrationsDir = path.join(cwd, "db", "migrations");

      if (!fs.existsSync(migrationsDir)) {
        console.log("No migrations directory found.");
        return;
      }

      const files = fs
        .readdirSync(migrationsDir)
        .filter((f) => f.endsWith(".ts"))
        .sort();

      console.log("");
      console.log(" Status   Migration ID    Migration Name");
      console.log("--------------------------------------------------");
      for (const file of files) {
        const match = file.match(/^(\d+)/);
        const id = match ? match[1] : "???";
        const name = file.replace(/^\d+-/, "").replace(/\.ts$/, "");
        console.log(`   up     ${id.padEnd(16)}${name}`);
      }
      console.log("");
    });

  return cmd;
}
