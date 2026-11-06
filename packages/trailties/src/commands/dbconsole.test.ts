import { afterEach, describe, expect, it, vi } from "vitest";
import { AdapterNotSpecified, HashConfig } from "@blazetrails/activerecord";
import { assertCalledWith, assertRaises, capture } from "@blazetrails/activesupport";
import { SystemExit, env, stderr } from "@blazetrails/ruby-compat";
import { DBConsole, DbconsoleCommand } from "./dbconsole.js";
import { invoke } from "../command.js";

const database = vi.hoisted(() => ({ results: {} as Record<string, unknown> }));

const kernel = vi.hoisted(() => ({ exec: (..._args: unknown[]): unknown => undefined }));

vi.mock("@blazetrails/ruby-compat", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@blazetrails/ruby-compat")>()),
  exec: (...args: unknown[]) => kernel.exec(...args),
}));

vi.mock("../database.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../database.js")>()),
  databaseConfiguration: async () => database.results,
}));

describe("Trails::DBConsoleTest", () => {
  let aborted = false;
  let output = "";

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  function stubAvailableEnvironments(environments: string[]): void {
    vi.spyOn(
      DbconsoleCommand.prototype as unknown as { availableEnvironments(): string[] },
      "availableEnvironments",
    ).mockReturnValue(environments);
  }

  function parseArguments(args: string[]) {
    return new DbconsoleCommand([], args).options;
  }

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

  it("trails env is development when environment option is dev", () => {
    vi.spyOn(
      DbconsoleCommand.prototype as unknown as { availableEnvironments(): string[] },
      "availableEnvironments",
    ).mockReturnValue(["development", "test"]);
    expect(new DbconsoleCommand([], ["-e", "dev"]).options.environment).toMatch("development");
  });

  it("config with database url only", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://foo:bar@localhost:9000/foo_test?pool=5&timeout=3000");
    const expected = {
      adapter: "postgresql",
      host: "localhost",
      port: 9000,
      database: "foo_test",
      username: "foo",
      password: "bar",
      pool: "5",
      timeout: "3000",
    };

    await appDbConfig(null, async () => {
      expect((await new DBConsole().dbConfig()).configurationHash).toEqual(expected);
    });
  });

  it("config choose database url if exists", async () => {
    const host = "database-url-host.com";
    vi.stubEnv("DATABASE_URL", `postgresql://foo:bar@${host}:9000/foo_test?pool=5&timeout=3000`);
    const sampleConfig = {
      test: {
        adapter: "postgresql",
        host: `not-the-${host}`,
        port: 9000,
        database: "foo_test",
        username: "foo",
        password: "bar",
        pool: "5",
        timeout: "3000",
      },
    };
    await appDbConfig(sampleConfig, async () => {
      expect((await new DBConsole().dbConfig()).configurationHash.host).toBe(host);
    });
  });

  it("env", () => {
    const ENV = env as Record<string, string | undefined>;
    const [trailsEnv, nodeEnv] = [ENV.TRAILS_ENV, ENV.NODE_ENV];
    try {
      expect(new DBConsole().environment()).toBe("test");

      delete ENV.TRAILS_ENV;
      delete ENV.NODE_ENV;

      expect(new DBConsole().environment()).toBe("development");

      ENV.NODE_ENV = "rack_env";
      expect(new DBConsole().environment()).toBe("rack_env");

      ENV.TRAILS_ENV = "rails_env";
      expect(new DBConsole().environment()).toBe("rails_env");
    } finally {
      ENV.TRAILS_ENV = trailsEnv;
      ENV.NODE_ENV = nodeEnv;
    }
  });

  it("start", async () => {
    await assertCalledWith(kernel, "exec", [/sqlite3/, /db\.sqlite3/], {}, () =>
      start({ adapter: "sqlite3", database: "db.sqlite3" }),
    );
    expect(aborted).toBeFalsy();
  });

  it("primary is automatically picked with 3 level configuration", async () => {
    const sampleConfig = { test: { primary: { adapter: "postgresql" } } };

    await appDbConfig(sampleConfig, async () => {
      expect((await new DBConsole().dbConfig()).configurationHash.adapter).toBe("postgresql");
    });
  });

  it("specifying a custom database and environment", () => {
    stubAvailableEnvironments(["development"]);
    const dbconsole = parseArguments(["--db", "custom", "-e", "development"]);

    expect(dbconsole.environment).toBe("development");
    expect(dbconsole.database).toBe("custom");
  });

  it("specifying a replica database", async () => {
    const options = { database: "primary_replica" };

    const sampleConfig = {
      test: {
        primary: { adapter: "sqlite3" },
        primary_replica: { adapter: "sqlite3", replica: true },
      },
    };

    await appDbConfig(sampleConfig, async () => {
      expect((await new DBConsole(options).dbConfig()).name).toBe("primary_replica");
    });
  });

  it("unknown command line client", async () => {
    await start({ adapter: "unknown", database: "db" });
    expect(aborted).toBeTruthy();
    expect(output).toMatch(/Database configuration specifies nonexistent 'unknown' adapter/);
  });

  it("specifying a missing database", async () => {
    await appDbConfig({}, async () => {
      const e = await assertRaises([AdapterNotSpecified], {}, () =>
        invoke("dbconsole", ["--db", "i_do_not_exist"]),
      );

      expect(e.message).toContain("'i_do_not_exist' database is not configured for 'test'.");
    });
  });

  it("specifying a missing environment", async () => {
    await appDbConfig({}, async () => {
      const e = await assertRaises([AdapterNotSpecified], {}, () => invoke("dbconsole"));

      expect(e.message).toContain("No databases are configured for 'test'.");
    });
  });

  it("print help short", async () => {
    const stdout = await capture("stdout", () => invoke("dbconsole", ["-h"]));
    expect(stdout).toMatch(/bin\/trails dbconsole/);
  });

  it("print help long", async () => {
    const stdout = await capture("stdout", () => invoke("dbconsole", ["--help"]));
    expect(stdout).toMatch(/bin\/trails dbconsole/);
  });
});
