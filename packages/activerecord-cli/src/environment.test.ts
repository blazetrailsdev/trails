import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { Base, DatabaseConfigurations, DatabaseTasks, UrlConfig } from "@blazetrails/activerecord";
import { loadDatabaseConfig } from "./db-helpers.js";
import {
  environmentDbConfig,
  establishEnvironmentConnection,
  normalizeSqlitePaths,
  withEnvironmentConnection,
} from "./environment.js";

function installConfig(
  raw: Record<string, { adapter: string; database: string }>,
  root: string,
): void {
  DatabaseTasks.databaseConfiguration = normalizeSqlitePaths(
    DatabaseConfigurations.fromEnv(raw),
    root,
  );
  DatabaseTasks.root = root;
}

describe("ArEnvironmentTest", () => {
  afterEach(() => {
    try {
      Base.removeConnection();
    } catch {
      /* empty */
    }
    DatabaseTasks.databaseConfiguration = null;
  });

  it("returns null when the environment has no configuration", () => {
    installConfig({ development: { adapter: "sqlite3", database: ":memory:" } }, "/nowhere");
    expect(environmentDbConfig("production")).toBeNull();
  });

  it("resolves a relative sqlite path against the project root, not the process cwd", async () => {
    const root = await mkdtemp(join(tmpdir(), "ar-env-root-"));
    await mkdir(join(root, "config"), { recursive: true });
    await writeFile(
      join(root, "config", "database.ts"),
      `export default { test: { adapter: "sqlite3", database: "db/test.sqlite3" } };\n`,
      "utf8",
    );
    await loadDatabaseConfig(root);
    expect(environmentDbConfig("test")?.database).toBe(join(root, "db", "test.sqlite3"));
  });

  it("expands a url-style sqlite config without flattening it to a HashConfig", () => {
    DatabaseTasks.databaseConfiguration = normalizeSqlitePaths(
      DatabaseConfigurations.fromEnv({ test: { adapter: "sqlite3", url: "db/test.sqlite3" } }),
      "/project",
    );
    const config = environmentDbConfig("test");
    expect(config).toBeInstanceOf(UrlConfig);
    expect((config as UrlConfig).url).toBe("db/test.sqlite3");
    expect(config?.database).toBe(join("/project", "db", "test.sqlite3"));
  });

  it("leaves absolute and in-memory sqlite databases untouched", async () => {
    const root = await mkdtemp(join(tmpdir(), "ar-env-abs-"));
    installConfig(
      {
        test: { adapter: "sqlite3", database: ":memory:" },
        other: { adapter: "sqlite3", database: join(root, "fixed.sqlite3") },
      },
      root,
    );
    expect(environmentDbConfig("test")?.database).toBe(":memory:");
    expect(environmentDbConfig("other")?.database).toBe(join(root, "fixed.sqlite3"));
  });

  it("hands back the same config object on repeated boots so the pool is reused", () => {
    installConfig({ test: { adapter: "sqlite3", database: "db/test.sqlite3" } }, "/nowhere");
    expect(environmentDbConfig("test")).toBe(environmentDbConfig("test"));
  });

  it("establishes the environment connection and leaves it open", async () => {
    installConfig({ test: { adapter: "sqlite3", database: ":memory:" } }, "/nowhere");
    const config = await establishEnvironmentConnection("test");
    expect(config).not.toBeNull();
    expect(Base.connectionPool()).toBeDefined();
  });

  it("runs the block with a connection and restores the prior state", async () => {
    installConfig({ test: { adapter: "sqlite3", database: ":memory:" } }, "/nowhere");
    let sawPool = false;
    await withEnvironmentConnection(async () => {
      sawPool = Base.connectionPool() != null;
    }, "test");
    expect(sawPool).toBe(true);
    expect(() => Base.connectionPool()).toThrow();
  });

  it("still runs the block when the environment has no configuration", async () => {
    installConfig({ development: { adapter: "sqlite3", database: ":memory:" } }, "/nowhere");
    let ran = false;
    await withEnvironmentConnection(async () => {
      ran = true;
    }, "production");
    expect(ran).toBe(true);
  });
});
