// First E2E suite for activerecord-cli. Pattern: in-process run() + tmp sqlite file. Extend with pg/mysql variants in follow-up PRs.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { run } from "../cli.js";
import { DatabaseTasks } from "@blazetrails/activerecord";

// Plain MigrationLike object — no import needed, so this resolves correctly
// from any path. connection is set by DefaultStrategy.exec() before up() fires.
const MIGRATION_BODY = `\
export default {
  async up() {
    await this.connection.createTable("users", (t) => {
      t.string("name");
    });
  },
  async down() {
    await this.connection.dropTable("users");
  },
};
`;

describe.skipIf(process.platform === "win32")("sqlite-happy-path E2E", () => {
  let tmpDir: string;
  let origTrailsEnv: string | undefined;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ar-cli-e2e-"));
    origTrailsEnv = process.env.TRAILS_ENV;
    // Use development env so the scaffolded file-based SQLite config is chosen.
    // NODE_ENV=test (set by vitest) would otherwise resolve the :memory: test config.
    process.env.TRAILS_ENV = "development";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (origTrailsEnv === undefined) {
      delete process.env.TRAILS_ENV;
    } else {
      process.env.TRAILS_ENV = origTrailsEnv;
    }
    // Reset DatabaseTasks singleton state so tests don't leak into each other.
    DatabaseTasks.databaseConfiguration = null;
    (DatabaseTasks as unknown as { _root: string | null })._root = null;
    DatabaseTasks.registerMigrations([]);
    DatabaseTasks.seedLoader = null;
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("init → db:create → generate:migration → db:migrate → db:version → db:migrate:status", async () => {
    // Suppress noisy init/create/migrate console output — we only assert on
    // db:version and db:migrate:status below.
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // 1. ar init — scaffolds config/database.ts, db/migrate/, app/models/, db.ts
    const initCode = await run(["init", "--driver", "better-sqlite3"], tmpDir);
    expect(initCode, "ar init should exit 0").toBe(0);

    // 2. ar db:create — creates db/development.sqlite3 (resolved relative to tmpDir)
    const createCode = await run(["db:create"], tmpDir);
    expect(createCode, "ar db:create should exit 0").toBe(0);

    // 3. ar generate:migration AddUsersTable — emits a stub migration file
    const genCode = await run(["generate:migration", "AddUsersTable"], tmpDir);
    expect(genCode, "ar generate:migration should exit 0").toBe(0);

    // Find the generated migration file
    const migrateDir = join(tmpDir, "db", "migrate");
    const entries = await readdir(migrateDir);
    const migrationEntry = entries.find((e) => e.endsWith("_add_users_table.ts"));
    expect(migrationEntry, "generated migration file should exist").toBeTruthy();

    const migrationPath = join(migrateDir, migrationEntry!);
    const version = migrationEntry!.split("_")[0]!;

    // 4. Patch the generated migration — overwrite with a plain MigrationLike
    //    object that creates the users table via this.connection (the adapter).
    await writeFile(migrationPath, MIGRATION_BODY, "utf8");

    // 5. ar db:migrate — applies the migration, stamps schema_migrations
    const migrateCode = await run(["db:migrate"], tmpDir);
    expect(migrateCode, "ar db:migrate should exit 0").toBe(0);

    // 6. ar db:version — should report the applied migration version
    const versionLines: string[] = [];
    vi.spyOn(console, "log").mockImplementation(
      (...args) => void versionLines.push(args.map(String).join(" ")),
    );
    const versionCode = await run(["db:version"], tmpDir);
    expect(versionCode, "ar db:version should exit 0").toBe(0);
    expect(versionLines.join("\n")).toContain(`Current version: ${version}`);

    // 7. ar db:migrate:status — should show the migration as "up"
    const statusLines: string[] = [];
    vi.spyOn(console, "log").mockImplementation(
      (...args) => void statusLines.push(args.map(String).join(" ")),
    );
    const statusCode = await run(["db:migrate:status"], tmpDir);
    expect(statusCode, "ar db:migrate:status should exit 0").toBe(0);
    const statusText = statusLines.join("\n");
    expect(statusText).toContain("up");
    expect(statusText).toContain(version);
  });
});
