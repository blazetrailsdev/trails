import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { CreateMigration, type MigrationRenderer } from "./create-migration.js";

const DEFAULT = "db/migrate/create_articles.rb";

let ROOT: string;

interface Store {
  log: string[];
}

function install(): Store {
  ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "trails-create-migration-"));
  fs.mkdirSync(path.join(ROOT, "db/migrate"), { recursive: true });
  return { log: [] };
}

function migrations(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir) : [];
}

function makeMigration(
  s: Store,
  destinationPath: string = DEFAULT,
  config: { force?: boolean; skip?: boolean } = {},
  generatorOptions: { pretend?: boolean } = {},
  data: MigrationRenderer = "contents",
): CreateMigration {
  const dir = path.dirname(`${ROOT}/${destinationPath}`);
  const next = migrations(dir).length + 1;
  const numbered = `${dir}/${next}_${path.basename(destinationPath)}`;
  const fileName = path.basename(destinationPath).replace(/\.rb$/, "");
  const host = {
    output: (m: string) => s.log.push(m),
    options: generatorOptions,
    migrationFileName: fileName,
    relativeToOriginalDestinationRoot: (p: string) =>
      p.startsWith(`${ROOT}/`) ? p.slice(ROOT.length + 1) : p,
  };
  return new CreateMigration(host, numbered, data, config);
}

describe("CreateMigration", () => {
  let s: Store;
  beforeEach(() => {
    s = install();
  });
  afterEach(() => {
    fs.rmSync(ROOT, { recursive: true, force: true });
  });

  const migrationExists = async (
    destinationPath: string = DEFAULT,
    data: MigrationRenderer = "contents",
  ) => {
    const m = makeMigration(s, destinationPath, {}, {}, data);
    await m.invoke();
    s.log.length = 0;
    return m;
  };

  it("test_invoke", async () => {
    const m = makeMigration(s);
    await m.invoke();
    expect(s.log.join("\n")).toMatch(/create {2}db\/migrate\/1_create_articles\.rb/);
    expect(fs.existsSync(m.destination)).toBe(true);
  });

  it("test_invoke_pretended", async () => {
    const m = makeMigration(s, DEFAULT, {}, { pretend: true });
    await m.invoke();
    expect(s.log.join("\n")).toMatch(/create {2}db\/migrate\/1_create_articles\.rb/);
    expect(fs.existsSync(m.destination)).toBe(false);
  });

  it("test_invoke_when_exists", async () => {
    const existing = await migrationExists();
    expect(makeMigration(s).existingMigration()).toBe(existing.destination);
  });

  it("test_invoke_when_exists_identical", async () => {
    await migrationExists();
    const m = makeMigration(s);
    await m.invoke();
    expect(s.log.join("\n")).toMatch(/identical {2}db\/migrate\/1_create_articles\.rb/);
    expect(await m.identical()).toBe(true);
  });

  it("test_invoke_return_existing_file_when_exists_identical", async () => {
    const existing = await migrationExists();
    expect(await makeMigration(s).invoke()).toBe(existing.relativeExistingMigration());
  });

  it("test_invoke_when_exists_not_identical", async () => {
    await migrationExists();
    await expect(makeMigration(s, DEFAULT, {}, {}, "different").invoke()).rejects.toThrow(
      /Another migration is already named/,
    );
  });

  it("test_invoke_forced_when_exists_not_identical", async () => {
    const dest = "db/migrate/migration.rb";
    const existing = await migrationExists(dest);
    const m = makeMigration(s, dest, { force: true }, {}, "different");
    await m.invoke();
    const out = s.log.join("\n");
    expect(out).toMatch(/remove {2}db\/migrate\/1_migration\.rb/);
    expect(out).toMatch(/create {2}db\/migrate\/2_migration\.rb/);
    expect(fs.existsSync(m.destination)).toBe(true);
    expect(fs.existsSync(existing.destination)).toBe(false);
  });

  it("test_invoke_forced_pretended_when_exists_not_identical", async () => {
    await migrationExists();
    const m = makeMigration(s, DEFAULT, { force: true }, { pretend: true }, "different");
    await m.invoke();
    const out = s.log.join("\n");
    expect(out).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb/);
    expect(out).toMatch(/create {2}db\/migrate\/2_create_articles\.rb/);
    expect(fs.existsSync(m.destination)).toBe(false);
  });

  it("test_invoke_skipped_when_exists_not_identical", async () => {
    await migrationExists();
    const m = makeMigration(s, DEFAULT, { skip: true }, {}, "different");
    await m.invoke();
    expect(s.log.join("\n")).toMatch(/skip {2}db\/migrate\/2_create_articles\.rb/);
    expect(fs.existsSync(m.destination)).toBe(false);
  });

  it("test_revoke", async () => {
    const existing = await migrationExists();
    makeMigration(s).revoke();
    expect(s.log.join("\n")).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb/);
    expect(fs.existsSync(existing.destination)).toBe(false);
  });

  it("test_revoke_pretended", async () => {
    const existing = await migrationExists();
    makeMigration(s, DEFAULT, {}, { pretend: true }).revoke();
    expect(s.log.join("\n")).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb/);
    expect(fs.existsSync(existing.destination)).toBe(true);
  });

  it("test_revoke_when_no_exists", async () => {
    makeMigration(s).revoke();
    expect(s.log.join("\n")).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb/);
  });
});
