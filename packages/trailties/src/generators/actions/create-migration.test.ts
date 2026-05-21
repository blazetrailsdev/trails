import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  fsAdapterConfig,
  registerFsAdapter,
  type FsAdapter,
  type PathAdapter,
} from "@blazetrails/activesupport";
import { CreateMigration, type MigrationRenderer } from "./create-migration.js";

const path: PathAdapter = {
  join: (...p) => p.join("/"),
  dirname: (p) => p.split("/").slice(0, -1).join("/") || "/",
  basename: (p) => p.split("/").pop()!,
  resolve: (...p) => p.join("/"),
  extname: (p) => {
    const i = p.lastIndexOf(".");
    return i >= 0 ? p.slice(i) : "";
  },
  isAbsolute: (p) => p.startsWith("/"),
  sep: "/",
};

const ROOT = "/app";
const DEFAULT = "db/migrate/create_articles.rb";

interface Store {
  files: Map<string, string>;
  log: string[];
}

function install(): Store {
  const files = new Map<string, string>();
  const dirs = new Set<string>([ROOT, `${ROOT}/db`, `${ROOT}/db/migrate`]);
  const dirOf = (p: string) => p.split("/").slice(0, -1).join("/") || "/";
  const fs = {
    exists: async (p: string) => files.has(p) || dirs.has(p),
    readFile: (async (p: string) => files.get(p)!) as unknown as FsAdapter["readFile"],
    writeFile: async (p: string, c: string) => {
      files.set(p, c);
    },
    unlink: async (p: string) => {
      files.delete(p);
    },
    mkdir: async (p: string) => {
      dirs.add(p);
    },
    readdir: async (p: string) =>
      [...files.keys()].filter((f) => dirOf(f) === p).map((f) => f.slice(p.length + 1)),
  } as unknown as FsAdapter;
  registerFsAdapter("create-migration-test", fs, path);
  fsAdapterConfig.adapter = "create-migration-test";
  return { files, log: [] };
}

function makeMigration(
  s: Store,
  destinationPath: string = DEFAULT,
  config: { force?: boolean; skip?: boolean } = {},
  generatorOptions: { pretend?: boolean } = {},
  data: MigrationRenderer = "contents",
): CreateMigration {
  const dir = path.dirname(`${ROOT}/${destinationPath}`);
  const next = [...s.files.keys()].filter((f) => path.dirname(f) === dir).length + 1;
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
  const PREV = fsAdapterConfig.adapter;
  let s: Store;
  beforeEach(() => {
    s = install();
  });
  afterEach(() => {
    fsAdapterConfig.adapter = PREV;
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
    expect(s.files.has(m.destination)).toBe(true);
  });

  it("test_invoke_pretended", async () => {
    const m = makeMigration(s, DEFAULT, {}, { pretend: true });
    await m.invoke();
    expect(s.log.join("\n")).toMatch(/create {2}db\/migrate\/1_create_articles\.rb/);
    expect(s.files.has(m.destination)).toBe(false);
  });

  it("test_invoke_when_exists", async () => {
    const existing = await migrationExists();
    expect(await makeMigration(s).existingMigration()).toBe(existing.destination);
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
    expect(await makeMigration(s).invoke()).toBe(await existing.relativeExistingMigration());
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
    expect(s.files.has(m.destination)).toBe(true);
    expect(s.files.has(existing.destination)).toBe(false);
  });

  it("test_invoke_forced_pretended_when_exists_not_identical", async () => {
    await migrationExists();
    const m = makeMigration(s, DEFAULT, { force: true }, { pretend: true }, "different");
    await m.invoke();
    const out = s.log.join("\n");
    expect(out).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb/);
    expect(out).toMatch(/create {2}db\/migrate\/2_create_articles\.rb/);
    expect(s.files.has(m.destination)).toBe(false);
  });

  it("test_invoke_skipped_when_exists_not_identical", async () => {
    await migrationExists();
    const m = makeMigration(s, DEFAULT, { skip: true }, {}, "different");
    await m.invoke();
    expect(s.log.join("\n")).toMatch(/skip {2}db\/migrate\/2_create_articles\.rb/);
    expect(s.files.has(m.destination)).toBe(false);
  });

  it("test_revoke", async () => {
    const existing = await migrationExists();
    await makeMigration(s).revoke();
    expect(s.log.join("\n")).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb/);
    expect(s.files.has(existing.destination)).toBe(false);
  });

  it("test_revoke_pretended", async () => {
    const existing = await migrationExists();
    await makeMigration(s, DEFAULT, {}, { pretend: true }).revoke();
    expect(s.log.join("\n")).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb/);
    expect(s.files.has(existing.destination)).toBe(true);
  });

  it("test_revoke_when_no_exists", async () => {
    await makeMigration(s).revoke();
    expect(s.log.join("\n")).toMatch(/remove {2}db\/migrate\/1_create_articles\.rb/);
  });
});
