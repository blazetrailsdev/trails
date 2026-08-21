import { describe, it, expect, afterEach } from "vitest";
import { setTrailsRoot } from "@blazetrails/activesupport";
import { Base } from "@blazetrails/activerecord";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { databaseConfiguration } from "./database.js";

describe("databaseConfiguration", () => {
  let tmpRoot: string;

  class RootConfigModel extends Base {}

  const originalConfigurations = Base.configurations();

  afterEach(() => {
    setTrailsRoot(null);
    Base.configurations(originalConfigurations);
    RootConfigModel.removeConnection();
    if (tmpRoot) nodeFs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  // Mirrors Rails' `Rails.root` seam: a relative `config/database.*` is loaded
  // from the application root, then assigned to `Base.configurations` before
  // `establish_connection` is called at all (railtie.rb:256-262).
  it("loads config/database.json from the injected root", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "trailties-root-"));
    nodeFs.mkdirSync(nodePath.join(tmpRoot, "config"));
    nodeFs.writeFileSync(
      nodePath.join(tmpRoot, "config", "database.json"),
      JSON.stringify({ test: { adapter: "sqlite3", database: "db/primary.sqlite3" } }),
    );
    setTrailsRoot(tmpRoot);

    Base.configurations(
      (await databaseConfiguration()) as unknown as Parameters<typeof Base.configurations>[0],
    );
    await RootConfigModel.establishConnection();

    const dbConfig = RootConfigModel.connectionDbConfig();
    expect(dbConfig.adapter).toBe("sqlite3");
    expect(dbConfig.configurationHash.database).toBe("db/primary.sqlite3");
  });

  it("raises when no config file exists and DATABASE_URL is unset", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "trailties-root-"));
    setTrailsRoot(tmpRoot);

    await expect(databaseConfiguration()).rejects.toThrow(/Could not load database configuration/);
  });

  // configuration.rb:451-453 — the flat arm.
  it("reverse merges the shared key into each environment", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "trailties-root-"));
    nodeFs.mkdirSync(nodePath.join(tmpRoot, "config"));
    nodeFs.writeFileSync(
      nodePath.join(tmpRoot, "config", "database.json"),
      JSON.stringify({
        shared: { adapter: "sqlite3", pool: 5 },
        test: { database: "db/test.sqlite3", pool: 9 },
      }),
    );
    setTrailsRoot(tmpRoot);

    const config = (await databaseConfiguration()) as Record<string, Record<string, unknown>>;
    expect(Object.keys(config)).toEqual(["test"]);
    expect(config.test).toEqual({ adapter: "sqlite3", database: "db/test.sqlite3", pool: 9 });
  });

  // configuration.rb:441-450 — the nested arm.
  it("reverse merges shared per named database when both are hashes of hashes", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "trailties-root-"));
    nodeFs.mkdirSync(nodePath.join(tmpRoot, "config"));
    nodeFs.writeFileSync(
      nodePath.join(tmpRoot, "config", "database.json"),
      JSON.stringify({
        shared: { primary: { adapter: "sqlite3" }, animals: { adapter: "postgresql" } },
        test: {
          primary: { database: "db/test.sqlite3" },
          animals: { database: "db/animals_test", adapter: "sqlite3" },
        },
      }),
    );
    setTrailsRoot(tmpRoot);

    const config = (await databaseConfiguration()) as Record<
      string,
      Record<string, Record<string, unknown>>
    >;
    expect(config.test.primary).toEqual({ adapter: "sqlite3", database: "db/test.sqlite3" });
    expect(config.test.animals).toEqual({ adapter: "sqlite3", database: "db/animals_test" });
  });

  // configuration.rb:458 — `Hash.new(shared).merge(loaded_yaml)`.
  it("resolves an unlisted environment to shared", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "trailties-root-"));
    nodeFs.mkdirSync(nodePath.join(tmpRoot, "config"));
    nodeFs.writeFileSync(
      nodePath.join(tmpRoot, "config", "database.json"),
      JSON.stringify({
        shared: { adapter: "sqlite3", database: "db/shared.sqlite3" },
        test: { database: "db/test.sqlite3" },
      }),
    );
    setTrailsRoot(tmpRoot);

    const config = (await databaseConfiguration()) as Record<string, Record<string, unknown>>;
    expect(config.staging).toEqual({ adapter: "sqlite3", database: "db/shared.sqlite3" });
    expect(Object.keys(config)).toEqual(["test"]);
  });
});
