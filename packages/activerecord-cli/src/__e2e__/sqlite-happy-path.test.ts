import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { run } from "../cli.js";
import {
  captureConsoleErrors,
  exitReason,
  MIGRATION_BODY,
  mkE2eTmpDir,
  teardownE2eFixture,
} from "./helpers.js";

describe.skipIf(process.platform === "win32")("sqlite-happy-path E2E", () => {
  let tmpDir: string;
  let origTrailsEnv: string | undefined;

  beforeEach(async () => {
    tmpDir = await mkE2eTmpDir("ar-cli-e2e-");
    origTrailsEnv = process.env.TRAILS_ENV;
    process.env.TRAILS_ENV = "development";
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (origTrailsEnv === undefined) {
      delete process.env.TRAILS_ENV;
    } else {
      process.env.TRAILS_ENV = origTrailsEnv;
    }
    await teardownE2eFixture(tmpDir);
  });

  it("init → db:create → generate:migration → db:migrate → db:version → db:migrate:status → db:schema:dump", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const errors = captureConsoleErrors();

    const initCode = await run(["init", "--driver", "better-sqlite3"], tmpDir);
    expect(initCode, exitReason("ar init should exit 0", errors)).toBe(0);

    const createCode = await run(["db:create"], tmpDir);
    expect(createCode, exitReason("ar db:create should exit 0", errors)).toBe(0);

    const genCode = await run(["generate:migration", "AddUsersTable"], tmpDir);
    expect(genCode, exitReason("ar generate:migration should exit 0", errors)).toBe(0);

    const migrateDir = join(tmpDir, "db", "migrate");
    const entries = await readdir(migrateDir);
    const migrationEntry = entries.find((e) => e.endsWith("_add_users_table.ts"));
    expect(migrationEntry, "generated migration file should exist").toBeTruthy();

    const migrationPath = join(migrateDir, migrationEntry!);
    const version = migrationEntry!.split("_")[0];

    await writeFile(migrationPath, MIGRATION_BODY, "utf8");

    const migrateCode = await run(["db:migrate"], tmpDir);
    expect(migrateCode, exitReason("ar db:migrate should exit 0", errors)).toBe(0);

    const versionLines: string[] = [];
    vi.spyOn(console, "log").mockImplementation(
      (...args) => void versionLines.push(args.map(String).join(" ")),
    );
    const versionCode = await run(["db:version"], tmpDir);
    expect(versionCode, exitReason("ar db:version should exit 0", errors)).toBe(0);
    expect(versionLines.join("\n")).toContain(`Current version: ${version}`);

    const statusChunks: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      statusChunks.push(String(chunk));
      return true;
    });
    const statusCode = await run(["db:migrate:status"], tmpDir);
    expect(statusCode, exitReason("ar db:migrate:status should exit 0", errors)).toBe(0);
    const statusText = statusChunks.join("");
    expect(statusText).toContain("up");
    expect(statusText).toContain(version);

    vi.spyOn(console, "log").mockImplementation(() => {});
    const dumpCode = await run(["db:schema:dump"], tmpDir);
    expect(dumpCode, exitReason("ar db:schema:dump should exit 0", errors)).toBe(0);
    const schema = await readFile(join(tmpDir, "db", "schema.ts"), "utf8");
    expect(schema).toContain("createTable");
    expect(schema).toContain("users");
  });
});
