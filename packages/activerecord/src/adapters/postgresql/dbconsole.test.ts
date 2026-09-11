import { it, expect, vi } from "vitest";
import { describeIfPg } from "../../support/describe-if-pg.js";
import { ActiveRecord } from "../../ar-config.js";
import { PostgreSQLAdapter } from "../../connection-adapters/postgresql-adapter.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import type { DatabaseConfigOptions } from "../../database-configurations/database-config.js";

describeIfPg("PostgresqlDbConsoleTest", () => {
  const makeDbConfig = (config: Record<string, unknown>) =>
    new HashConfig("test", "primary", config as DatabaseConfigOptions);

  const assertFindCmdAndExecCalledWith = <T>(args: unknown[], block: () => T): T => {
    const spy = vi.spyOn(PostgreSQLAdapter, "findCmdAndExec").mockImplementation(() => []);
    try {
      const result = block();
      expect(spy).toHaveBeenCalledWith(...args);
      return result;
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

    const { env } = assertFindCmdAndExecCalledWith(["psql", "db"], () =>
      PostgreSQLAdapter.dbconsole(config),
    );

    expect(env.PGUSER).toBe("user");
    expect(env.PGHOST).toBe("host");
    expect(env.PGPORT).toBe("5432");
    expect(env.PGPASSWORD).not.toBe("q1w2e3");
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

    const { env } = assertFindCmdAndExecCalledWith(["psql", "db"], () =>
      PostgreSQLAdapter.dbconsole(config),
    );

    expect(env.PGSSLMODE).toBe("verify-full");
    expect(env.PGSSLCERT).toBe("client.crt");
    expect(env.PGSSLKEY).toBe("client.key");
    expect(env.PGSSLROOTCERT).toBe("root.crt");
  });

  it("postgresql include password", () => {
    const config = makeDbConfig({
      adapter: "postgresql",
      database: "db",
      username: "user",
      password: "q1w2e3",
    });

    const { env } = assertFindCmdAndExecCalledWith(["psql", "db"], () =>
      PostgreSQLAdapter.dbconsole(config, { includePassword: true }),
    );

    expect(env.PGUSER).toBe("user");
    expect(env.PGPASSWORD).toBe("q1w2e3");
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

    const { env } = assertFindCmdAndExecCalledWith(["psql", "db"], () =>
      PostgreSQLAdapter.dbconsole(config),
    );

    expect(env.PGOPTIONS).toBe(
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
