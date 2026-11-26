import { Pathname } from "@blazetrails/ruby-compat/pathname";
import { describe, it, expect, afterEach } from "vitest";
import { Base } from "@blazetrails/activerecord";
import * as nodeFs from "node:fs";
import * as nodeOs from "node:os";
import * as nodePath from "node:path";
import { Configuration } from "../lib/application/configuration.js";

const exportDefault = (value: unknown) => `export default ${JSON.stringify(value)};`;

describe("Configuration#databaseConfiguration", () => {
  let tmpRoot: string;

  class RootConfigModel extends Base {}

  const originalConfigurations = Base.configurations();

  afterEach(async () => {
    Base.configurations(originalConfigurations);
    await RootConfigModel.removeConnection();
    if (tmpRoot) nodeFs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("loads config/database from the application root, not the cwd", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "trailties-root-"));
    nodeFs.mkdirSync(nodePath.join(tmpRoot, "config"));
    nodeFs.writeFileSync(
      nodePath.join(tmpRoot, "config", "database.ts"),
      exportDefault({ test: { adapter: "sqlite3", database: "storage/primary.sqlite3" } }),
    );

    Base.configurations(
      (await new Configuration(
        new Pathname(tmpRoot),
      ).databaseConfiguration()) as unknown as Parameters<typeof Base.configurations>[0],
    );
    await RootConfigModel.establishConnection();

    const dbConfig = RootConfigModel.connectionDbConfig();
    expect(dbConfig.adapter).toBe("sqlite3");
    expect(dbConfig.configurationHash.database).toBe("storage/primary.sqlite3");
  });

  it("loads config/database.js from a compiled root with no config/database.ts", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "trailties-root-"));
    nodeFs.mkdirSync(nodePath.join(tmpRoot, "config"));
    nodeFs.writeFileSync(
      nodePath.join(tmpRoot, "config", "database.js"),
      exportDefault({ test: { adapter: "sqlite3", database: "storage/compiled.sqlite3" } }),
    );

    const config = (await new Configuration(
      new Pathname(tmpRoot),
    ).databaseConfiguration()) as Record<string, Record<string, unknown>>;
    expect(config.test).toEqual({ adapter: "sqlite3", database: "storage/compiled.sqlite3" });
  });

  it("raises when no config file exists and DATABASE_URL is unset", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "trailties-root-"));

    await expect(new Configuration(new Pathname(tmpRoot)).databaseConfiguration()).rejects.toThrow(
      /Could not load database configuration/,
    );
  });

  it("reverse merges the shared key into each environment", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "trailties-root-"));
    nodeFs.mkdirSync(nodePath.join(tmpRoot, "config"));
    nodeFs.writeFileSync(
      nodePath.join(tmpRoot, "config", "database.ts"),
      exportDefault({
        shared: { adapter: "sqlite3", pool: 5 },
        test: { database: "storage/test.sqlite3", pool: 9 },
      }),
    );

    const config = (await new Configuration(
      new Pathname(tmpRoot),
    ).databaseConfiguration()) as Record<string, Record<string, unknown>>;
    expect(Object.keys(config)).toEqual(["test"]);
    expect(config.test).toEqual({ adapter: "sqlite3", database: "storage/test.sqlite3", pool: 9 });
  });

  it("reverse merges shared per named database when both are hashes of hashes", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "trailties-root-"));
    nodeFs.mkdirSync(nodePath.join(tmpRoot, "config"));
    nodeFs.writeFileSync(
      nodePath.join(tmpRoot, "config", "database.ts"),
      exportDefault({
        shared: { primary: { adapter: "sqlite3" }, animals: { adapter: "postgresql" } },
        test: {
          primary: { database: "storage/test.sqlite3" },
          animals: { database: "storage/animals_test", adapter: "sqlite3" },
        },
      }),
    );

    const config = (await new Configuration(
      new Pathname(tmpRoot),
    ).databaseConfiguration()) as Record<string, Record<string, Record<string, unknown>>>;
    expect(config.test.primary).toEqual({ adapter: "sqlite3", database: "storage/test.sqlite3" });
    expect(config.test.animals).toEqual({ adapter: "sqlite3", database: "storage/animals_test" });
  });

  it("resolves an unlisted environment to shared", async () => {
    tmpRoot = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "trailties-root-"));
    nodeFs.mkdirSync(nodePath.join(tmpRoot, "config"));
    nodeFs.writeFileSync(
      nodePath.join(tmpRoot, "config", "database.ts"),
      exportDefault({
        shared: { adapter: "sqlite3", database: "storage/shared.sqlite3" },
        test: { database: "storage/test.sqlite3" },
      }),
    );

    const config = (await new Configuration(
      new Pathname(tmpRoot),
    ).databaseConfiguration()) as Record<string, Record<string, unknown>>;
    expect(config.staging).toEqual({ adapter: "sqlite3", database: "storage/shared.sqlite3" });
    expect(Object.keys(config)).toEqual(["test"]);
  });
});
