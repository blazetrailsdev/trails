import { describe, it, expect, vi } from "vitest";
import { PostgreSQLDatabaseTasks, normalizeSchemaSearchPath } from "./postgresql-database-tasks.js";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { UrlConfig } from "../database-configurations/url-config.js";
import { DatabaseAlreadyExists } from "../errors.js";

function config(overrides: Record<string, unknown> = {}): HashConfig {
  return new HashConfig("development", "primary", {
    adapter: "postgresql",
    database: "trails_test",
    ...overrides,
  });
}

describe("PostgreSQLDatabaseTasks", () => {
  it("test_using_database_configurations_is_true", () => {
    expect(PostgreSQLDatabaseTasks.usingDatabaseConfigurations()).toBe(true);
  });

  it("test_registers_with_database_tasks", () => {
    DatabaseTasks.clearRegisteredTasks();
    PostgreSQLDatabaseTasks.register();
    expect(DatabaseTasks.resolveTask("postgresql")).toBeDefined();
  });

  it("test_purge_drops_then_recreates_with_already_connected_flag", async () => {
    const calls: Array<string> = [];
    const tasks = new PostgreSQLDatabaseTasks(config());
    vi.spyOn(tasks, "drop").mockImplementation(async () => {
      calls.push("drop");
    });
    vi.spyOn(tasks, "create").mockImplementation(async (alreadyConnected?: boolean) => {
      calls.push(alreadyConnected ? "create(true)" : "create");
    });
    await tasks.purge();
    expect(calls).toEqual(["drop", "create(true)"]);
  });

  it("create passes the whole configuration hash to connection.createDatabase", async () => {
    const createDatabase = vi.fn(async () => {});
    const establishCalls: Array<Record<string, unknown> | undefined> = [];
    const tasks = new PostgreSQLDatabaseTasks(
      config({ owner: "trails_owner", template: "template0" }),
    );
    vi.spyOn(
      tasks as unknown as { connection(): Promise<unknown> },
      "connection",
    ).mockResolvedValue({ createDatabase });
    vi.spyOn(
      tasks as unknown as { establishConnection(c?: Record<string, unknown>): Promise<void> },
      "establishConnection",
    ).mockImplementation(async (c?: Record<string, unknown>) => {
      establishCalls.push(c);
    });

    await tasks.create();

    expect(createDatabase).toHaveBeenCalledWith("trails_test", {
      adapter: "postgresql",
      database: "trails_test",
      owner: "trails_owner",
      template: "template0",
      encoding: "utf8",
    });
    expect(establishCalls).toHaveLength(2);
    expect(establishCalls[0]).toMatchObject({ database: "postgres", schemaSearchPath: "public" });
    expect(establishCalls[1]).toBeUndefined();
  });

  it("create leaves the pool on the public schema config when createDatabase raises", async () => {
    const establishCalls: Array<Record<string, unknown> | undefined> = [];
    const tasks = new PostgreSQLDatabaseTasks(config());
    vi.spyOn(
      tasks as unknown as { connection(): Promise<unknown> },
      "connection",
    ).mockResolvedValue({
      createDatabase: vi.fn(async () => {
        throw new DatabaseAlreadyExists('database "trails_test" already exists');
      }),
    });
    vi.spyOn(
      tasks as unknown as { establishConnection(c?: Record<string, unknown>): Promise<void> },
      "establishConnection",
    ).mockImplementation(async (c?: Record<string, unknown>) => {
      establishCalls.push(c);
    });

    await expect(tasks.create()).rejects.toBeInstanceOf(DatabaseAlreadyExists);

    expect(establishCalls).toHaveLength(1);
    expect(establishCalls[0]).toMatchObject({ database: "postgres", schemaSearchPath: "public" });
  });

  it("create names db_config.database on a url-only configuration", async () => {
    const establishCalls: Array<Record<string, unknown> | undefined> = [];
    const createDatabase = vi.fn(async () => {});
    const tasks = new PostgreSQLDatabaseTasks(
      new UrlConfig("development", "primary", "postgres://someone:secret@localhost:5433/url_db"),
    );
    vi.spyOn(
      tasks as unknown as { connection(): Promise<unknown> },
      "connection",
    ).mockResolvedValue({ createDatabase });
    vi.spyOn(
      tasks as unknown as { establishConnection(c?: Record<string, unknown>): Promise<void> },
      "establishConnection",
    ).mockImplementation(async (c?: Record<string, unknown>) => {
      establishCalls.push(c);
    });

    await tasks.create();

    expect(createDatabase).toHaveBeenCalledWith(
      "url_db",
      expect.objectContaining({ host: "localhost", port: 5433, encoding: "utf8" }),
    );
    expect(establishCalls[0]).toMatchObject({ database: "postgres", schemaSearchPath: "public" });
  });

  it("psqlEnv reads the configuration hash on a url-only configuration", () => {
    const tasks = new PostgreSQLDatabaseTasks(
      new UrlConfig(
        "development",
        "primary",
        "postgres://someone:secret@localhost:5433/url_db?sslmode=require",
      ),
    );
    const env = (tasks as unknown as { psqlEnv(): Record<string, string> }).psqlEnv();
    expect(env.PGHOST).toBe("localhost");
    expect(env.PGPORT).toBe("5433");
    expect(env.PGUSER).toBe("someone");
    expect(env.PGPASSWORD).toBe("secret");
    expect(env.PGSSLMODE).toBe("require");
  });

  describe("structureDump schema filtering", () => {
    it("normalizes $user and quoted entries out of --schema= args", () => {
      // Uses the exported normalizeSchemaSearchPath helper — same code
      // path structureDump calls, so the test can't drift.
      expect(normalizeSchemaSearchPath("'$user', public, \"custom\"")).toEqual([
        "public",
        "custom",
      ]);
    });

    it("handles empty and whitespace-only entries", () => {
      expect(normalizeSchemaSearchPath("  , public, ,")).toEqual(["public"]);
    });
  });

  it("a global ignore_tables regexp excludes every matching data source", async () => {
    // Ruby's `Regexp#===` (`postgresql_database_tasks.rb:68`) carries no state,
    // so a `/g` pattern must not skip alternate tables here.
    const { SchemaDumper } = await import("../schema-dumper.js");
    const previous = SchemaDumper.ignoreTables;
    SchemaDumper.ignoreTables = [/^prefix_/g];
    const tasks = new PostgreSQLDatabaseTasks(config());
    vi.spyOn(
      tasks as unknown as { connection: () => Promise<unknown> },
      "connection",
    ).mockResolvedValue({
      dataSources: async () => ["prefix_a", "prefix_b", "prefix_c"],
      schemaSearchPath: async () => "public",
    });
    let args: string[] = [];
    vi.spyOn(
      tasks as unknown as {
        runCmd: (cmd: string, args: string[], action: string) => Promise<void>;
      },
      "runCmd",
    ).mockImplementation(async (_cmd, passed) => {
      args = passed;
    });
    vi.spyOn(
      tasks as unknown as { removeSqlHeaderComments: () => Promise<void> },
      "removeSqlHeaderComments",
    ).mockResolvedValue(undefined);

    try {
      await tasks.structureDump("/dev/null");
    } finally {
      SchemaDumper.ignoreTables = previous;
      vi.restoreAllMocks();
    }

    expect(args).toEqual(
      expect.arrayContaining(["-T", "prefix_a", "-T", "prefix_b", "-T", "prefix_c"]),
    );
    expect(args.filter((a) => a === "-T")).toHaveLength(3);
  });
});
