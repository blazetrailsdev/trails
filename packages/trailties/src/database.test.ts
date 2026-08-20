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
});
