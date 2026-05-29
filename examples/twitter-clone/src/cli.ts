/**
 * A tiny `rails db:*`-style task runner for the example.
 *
 *   pnpm db:create          create the database
 *   pnpm db:drop            delete the database
 *   pnpm db:migrate         run pending migrations (then dump schema)
 *   pnpm db:rollback [n]    roll back the last n migrations (default 1)
 *   pnpm db:migrate:status  show each migration's up/down state
 *   pnpm db:seed            load db/seeds.ts
 *   pnpm db:schema:dump     regenerate db/schema-columns.json
 *   pnpm db:setup           create + migrate + seed
 *   pnpm db:prepare         create if needed + migrate + seed if empty
 *   pnpm db:reset           drop + setup
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import { connect, loadModelSchemas } from "./db.js";
import { sqliteDatabasePath } from "./database-config.js";
import { migrate, rollback, status } from "./migrator.js";
import { dumpSchema } from "./schema-dump.js";
import { User } from "./models/index.js";
import { seed } from "../db/seeds.js";

const dbPath = sqliteDatabasePath();

function dbExists(): boolean {
  return dbPath ? existsSync(dbPath) : false;
}

async function createDatabase(): Promise<void> {
  if (dbPath) mkdirSync(dirname(dbPath), { recursive: true });
  await connect(); // opening a SQLite connection creates the file
  console.log(`Created database${dbPath ? ` (${dbPath})` : ""}.`);
}

function dropDatabase(): void {
  if (!dbPath) {
    console.log("Nothing to drop (non-file database).");
    return;
  }
  for (const suffix of ["", "-wal", "-shm"]) rmSync(dbPath + suffix, { force: true });
  console.log(`Dropped database (${dbPath}).`);
}

async function runMigrate(): Promise<void> {
  await connect();
  await migrate();
  await dumpSchema(); // keep db/schema-columns.json in lock-step, like Rails' schema.rb
  console.log("Migrations complete.");
}

async function runSeed(): Promise<void> {
  await connect();
  await loadModelSchemas();
  await seed();
}

async function main(): Promise<void> {
  const task = process.argv[2];
  const step = Number(process.argv[3] ?? process.env.STEP ?? 1);

  switch (task) {
    case "db:create":
      await createDatabase();
      break;
    case "db:drop":
      dropDatabase();
      break;
    case "db:migrate":
      await runMigrate();
      break;
    case "db:rollback":
      if (!Number.isInteger(step) || step < 1) {
        console.error(
          `Invalid step "${process.argv[3] ?? process.env.STEP}" — pass a positive integer.`,
        );
        process.exit(2);
      }
      await connect();
      await rollback(step);
      await dumpSchema();
      console.log(`Rolled back ${step} migration(s).`);
      break;
    case "db:migrate:status":
      await connect();
      await status();
      break;
    case "db:seed":
      await runSeed();
      break;
    case "db:schema:dump":
      await connect();
      await dumpSchema();
      break;
    case "db:setup":
      await createDatabase();
      await runMigrate();
      await runSeed();
      break;
    case "db:prepare":
      if (!dbExists()) await createDatabase();
      await runMigrate();
      await loadModelSchemas();
      if ((await User.count()) === 0) await seed();
      break;
    case "db:reset":
      dropDatabase();
      await createDatabase();
      await runMigrate();
      await runSeed();
      break;
    default:
      console.error(`Unknown task: ${task ?? "(none)"}\nSee src/cli.ts for the task list.`);
      process.exit(2);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
