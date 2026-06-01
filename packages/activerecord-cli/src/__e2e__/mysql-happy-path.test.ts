// MySQL E2E suite — mirrors sqlite-happy-path.test.ts and postgres-happy-path.test.ts.
// Set MYSQL_TEST_URL to run (same var used by packages/activerecord MySQL test suite).

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { run } from "../cli.js";
import { DatabaseTasks } from "@blazetrails/activerecord";

const MYSQL_URL = process.env.MYSQL_TEST_URL;

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

function mysqlUrlWithDb(url: string, dbName: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${dbName}`;
  return parsed.toString();
}

// This suite drives real MySQL: every `run([...])` does a cold connect +
// CREATE/DROP DATABASE. On a heavily loaded MariaDB CI runner those round-trips
// occasionally blow past vitest's defaults (5s test, 10s hook), surfacing as
// "Hook timed out in 10000ms". The activerecord-cli suite runs under the
// "other" vitest project, which doesn't bump timeouts. Give the body 30s (suite
// option, mirrors #2758) and the afterEach teardown its own 30s below (suite
// timeout doesn't reach hooks; matches the activerecord project's
// hookTimeout: 30_000). Parity with postgres-happy-path.test.ts.
describe.skipIf(!MYSQL_URL)("mysql-happy-path E2E", { timeout: 30_000 }, () => {
  let tmpDir: string;
  let dbUrl: string;
  let origTrailsEnv: string | undefined;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "ar-cli-e2e-mysql-"));
    dbUrl = mysqlUrlWithDb(MYSQL_URL!, `ar_cli_e2e_${process.hrtime.bigint()}`);
    origTrailsEnv = process.env.TRAILS_ENV;
    process.env.TRAILS_ENV = "development";
  });

  afterEach(async () => {
    // Drop before restoring mocks so teardown stays quiet. Best-effort.
    try {
      await run(["db:drop"], tmpDir);
    } catch {
      // ignore
    }
    vi.restoreAllMocks();
    if (origTrailsEnv === undefined) {
      delete process.env.TRAILS_ENV;
    } else {
      process.env.TRAILS_ENV = origTrailsEnv;
    }
    DatabaseTasks.databaseConfiguration = null;
    (DatabaseTasks as unknown as { _root: string | null })._root = null;
    DatabaseTasks.registerMigrations([]);
    DatabaseTasks.seedLoader = null;
    await rm(tmpDir, { recursive: true, force: true });
    // Per-hook timeout: the suite-level option above covers tests, not hooks,
    // and db:drop here does the same cold connect + DROP DATABASE. See the
    // describe block for the full rationale.
  }, 30_000);

  it("init → db:create → generate:migration → db:migrate → db:version → db:migrate:status", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // 1. ar init — scaffolds config/database.ts, db/migrate/, app/models/, db.ts
    const initCode = await run(["init", "--driver", "mysql2"], tmpDir);
    expect(initCode, "ar init should exit 0").toBe(0);

    // 2. Overwrite config/database.ts with our unique MySQL DB URL.
    const mysqlConfig = `const config = {
  development: { adapter: "mysql2", url: "${dbUrl}" },
  test:        { adapter: "mysql2", url: "${dbUrl}" },
  production:  { adapter: "mysql2", url: "${dbUrl}" },
};
export default config;
`;
    await writeFile(join(tmpDir, "config", "database.ts"), mysqlConfig, "utf8");

    // 3. ar db:create
    const createCode = await run(["db:create"], tmpDir);
    expect(createCode, "ar db:create should exit 0").toBe(0);

    // 4. ar generate:migration AddUsersTable
    const genCode = await run(["generate:migration", "AddUsersTable"], tmpDir);
    expect(genCode, "ar generate:migration should exit 0").toBe(0);

    const migrateDir = join(tmpDir, "db", "migrate");
    const entries = await readdir(migrateDir);
    const migrationEntry = entries.find((e) => e.endsWith("_add_users_table.ts"));
    expect(migrationEntry, "generated migration file should exist").toBeTruthy();

    const migrationPath = join(migrateDir, migrationEntry!);
    const version = migrationEntry!.split("_")[0]!;

    // 5. Patch the generated migration
    await writeFile(migrationPath, MIGRATION_BODY, "utf8");

    // 6. ar db:migrate
    const migrateCode = await run(["db:migrate"], tmpDir);
    expect(migrateCode, "ar db:migrate should exit 0").toBe(0);

    // 7. ar db:version
    const versionLines: string[] = [];
    vi.spyOn(console, "log").mockImplementation(
      (...args) => void versionLines.push(args.map(String).join(" ")),
    );
    const versionCode = await run(["db:version"], tmpDir);
    expect(versionCode, "ar db:version should exit 0").toBe(0);
    expect(versionLines.join("\n")).toContain(`Current version: ${version}`);

    // 8. ar db:migrate:status
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
