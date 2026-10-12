import { afterEach, describe, expect, it, vi } from "vitest";
import { AdapterNotSpecified, HashConfig } from "@blazetrails/activerecord";
import { assertRaises } from "@blazetrails/activesupport";
import { SystemExit, stderr } from "@blazetrails/ruby-compat";
import { DBConsole, DbconsoleCommand } from "./dbconsole.js";

const database = vi.hoisted(() => ({ results: {} as Record<string, unknown> }));

vi.mock("../database.js", () => ({ databaseConfiguration: async () => database.results }));
vi.mock("../command/actions.js", () => ({
  requireApplicationBang: async () => {},
  bootApplicationBang: async () => {},
}));

describe("Rails::DBConsoleTest", () => {
  let aborted = false;
  let output = "";

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function appDbConfig(
    results: Record<string, unknown> | null,
    block: () => Promise<void>,
  ): Promise<void> {
    database.results = results ?? {};
    await block();
  }

  async function start(config: Record<string, unknown> = {}): Promise<void> {
    const dbconsole = new DBConsole({});
    let hashConfig: HashConfig | null = null;
    vi.spyOn(dbconsole, "dbConfig").mockImplementation(
      async () => (hashConfig ??= new HashConfig("test", "primary", config)) as never,
    );
    aborted = false;
    output = "";
    vi.spyOn(stderr, "write").mockImplementation((chunk: unknown) => {
      output += String(chunk);
      return true;
    });
    try {
      await dbconsole.start();
    } catch (error) {
      if (!(error instanceof SystemExit)) throw error;
      aborted = true;
    }
  }

  it("config with db config only", async () => {
    const configSample = {
      test: {
        adapter: "sqlite3",
        host: "localhost",
        port: "9000",
        database: "foo_test",
        user: "foo",
        password: "bar",
        pool: "5",
        timeout: "3000",
      },
    };
    await appDbConfig(configSample, async () => {
      expect((await new DBConsole().dbConfig()).configurationHash).toEqual(configSample.test);
    });
  });

  it("config with no db config", async () => {
    await appDbConfig(null, async () => {
      await expect(new DBConsole().dbConfig()).rejects.toThrow(AdapterNotSpecified);
    });
  });

  it("rails env is development when environment option is dev", () => {
    vi.spyOn(
      DbconsoleCommand.prototype as unknown as { availableEnvironments(): string[] },
      "availableEnvironments",
    ).mockReturnValue(["development", "test"]);
    expect(new DbconsoleCommand({ environment: "dev" }).options.environment).toMatch("development");
  });

  it("unknown command line client", async () => {
    await start({ adapter: "unknown", database: "db" });
    expect(aborted).toBeTruthy();
    expect(output).toMatch(/Database configuration specifies nonexistent 'unknown' adapter/);
  });

  it("specifying a missing database", async () => {
    await appDbConfig({}, async () => {
      const e = await assertRaises([AdapterNotSpecified], {}, () =>
        new DBConsole({ database: "i_do_not_exist" }).dbConfig(),
      );

      expect(e.message).toContain("'i_do_not_exist' database is not configured for 'test'.");
    });
  });

  it("specifying a missing environment", async () => {
    await appDbConfig({}, async () => {
      const e = await assertRaises([AdapterNotSpecified], {}, () => new DBConsole().dbConfig());

      expect(e.message).toContain("No databases are configured for 'test'.");
    });
  });
});
