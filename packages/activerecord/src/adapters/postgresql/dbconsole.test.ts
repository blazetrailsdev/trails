import { it, expect, vi, beforeEach, afterEach } from "vitest";
import { env as ENV, setEnv } from "@blazetrails/ruby-compat";
import { describeIfPg } from "../../support/describe-if-pg.js";
import { ActiveRecord } from "../../ar-config.js";
import { PostgreSQLAdapter } from "../../connection-adapters/postgresql-adapter.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import type { DatabaseConfigOptions } from "../../database-configurations/database-config.js";

describeIfPg("PostgresqlDbConsoleTest", () => {
  const ENV_VARS = [
    "PGUSER",
    "PGHOST",
    "PGPORT",
    "PGPASSWORD",
    "PGSSLMODE",
    "PGSSLCERT",
    "PGSSLKEY",
    "PGSSLROOTCERT",
    "PGOPTIONS",
  ];

  let oldValues: (string | undefined)[] = [];
  beforeEach(() => {
    oldValues = ENV_VARS.map((v) => ENV[v]);
  });
  afterEach(() => {
    ENV_VARS.forEach((v, i) => setEnv(v, oldValues[i]));
  });

  const makeDbConfig = (config: Record<string, unknown>) =>
    new HashConfig("test", "primary", config as DatabaseConfigOptions);

  const assertFindCmdAndExecCalledWith = (args: unknown[], block: () => unknown): void => {
    const spy = vi.spyOn(PostgreSQLAdapter, "findCmdAndExec").mockImplementation(() => []);
    try {
      block();
      expect(spy).toHaveBeenCalledWith(...args);
    } finally {
      spy.mockRestore();
    }
  };

  it("postgresql", () => {
    const config = makeDbConfig({ adapter: "postgresql", database: "db" });

    assertFindCmdAndExecCalledWith(["psql", "db"], () => PostgreSQLAdapter.dbconsole(config));
  });

  it("postgresql full", () => {
    const config = makeDbConfig({
      adapter: "postgresql",
      database: "db",
      username: "user",
      password: "q1w2e3",
      host: "host",
      port: 5432,
    });

    assertFindCmdAndExecCalledWith(["psql", "db"], () => PostgreSQLAdapter.dbconsole(config));

    expect(ENV["PGUSER"]).toBe("user");
    expect(ENV["PGHOST"]).toBe("host");
    expect(ENV["PGPORT"]).toBe("5432");
    expect(ENV["PGPASSWORD"]).not.toBe("q1w2e3");
  });

  it("postgresql with ssl", () => {
    const config = makeDbConfig({
      adapter: "postgresql",
      database: "db",
      sslmode: "verify-full",
      sslcert: "client.crt",
      sslkey: "client.key",
      sslrootcert: "root.crt",
    });

    assertFindCmdAndExecCalledWith(["psql", "db"], () => PostgreSQLAdapter.dbconsole(config));

    expect(ENV["PGSSLMODE"]).toBe("verify-full");
    expect(ENV["PGSSLCERT"]).toBe("client.crt");
    expect(ENV["PGSSLKEY"]).toBe("client.key");
    expect(ENV["PGSSLROOTCERT"]).toBe("root.crt");
  });

  it("postgresql include password", () => {
    const config = makeDbConfig({
      adapter: "postgresql",
      database: "db",
      username: "user",
      password: "q1w2e3",
    });

    assertFindCmdAndExecCalledWith(["psql", "db"], () =>
      PostgreSQLAdapter.dbconsole(config, { includePassword: true }),
    );

    expect(ENV["PGUSER"]).toBe("user");
    expect(ENV["PGPASSWORD"]).toBe("q1w2e3");
  });

  it("postgresql include variables", () => {
    const config = makeDbConfig({
      adapter: "postgresql",
      database: "db",
      variables: {
        search_path: "my_schema, default, \\my_schema",
        statement_timeout: 5000,
        lock_timeout: ":default",
      },
    });

    assertFindCmdAndExecCalledWith(["psql", "db"], () => PostgreSQLAdapter.dbconsole(config));

    expect(ENV["PGOPTIONS"]).toBe(
      "-c search_path=my_schema,\\ default,\\ \\\\my_schema -c statement_timeout=5000",
    );
  });

  it("postgresql can use alternative cli", () => {
    ActiveRecord.databaseCli["postgresql"] = "pgcli";
    try {
      const config = makeDbConfig({ adapter: "postgresql", database: "db" });

      assertFindCmdAndExecCalledWith(["pgcli", "db"], () => PostgreSQLAdapter.dbconsole(config));
    } finally {
      ActiveRecord.databaseCli["postgresql"] = "psql";
    }
  });
});
