import { it, expect, vi } from "vitest";
import { describeIfMysqlAdapter } from "../../support/describe-if-mysql-adapter.js";
import { Base } from "../../base.js";
import { Mysql2Adapter } from "../../connection-adapters/mysql2-adapter.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import type { DatabaseConfigOptions } from "../../database-configurations/database-config.js";

describeIfMysqlAdapter("Mysql2DbConsoleTest", () => {
  const makeDbConfig = (config: Record<string, unknown>) =>
    new HashConfig("test", "primary", config as DatabaseConfigOptions);

  const assertFindCmdAndExecCalledWith = (args: unknown[], block: () => unknown) => {
    const spy = vi.spyOn(Mysql2Adapter, "findCmdAndExec").mockImplementation(() => []);
    try {
      block();
      expect(spy).toHaveBeenCalledWith(...args);
    } finally {
      spy.mockRestore();
    }
  };

  it("mysql", () => {
    const config = makeDbConfig({ adapter: "mysql2", database: "db" });

    assertFindCmdAndExecCalledWith([["mysql", "mysql5"], "db"], () =>
      Mysql2Adapter.dbconsole(config),
    );
  });

  it("mysql full", () => {
    const config = makeDbConfig({
      adapter: "mysql2",
      database: "db",
      host: "localhost",
      port: 1234,
      socket: "socket",
      username: "user",
      password: "qwerty",
      encoding: "UTF-8",
      sslca: "/path/to/ca-cert.pem",
      sslcert: "/path/to/client-cert.pem",
      sslcapath: "/path/to/cacerts",
      sslcipher: "DHE-RSA-AES256-SHA",
      sslkey: "/path/to/client-key.pem",
      ssl_mode: "VERIFY_IDENTITY",
    });

    const args = [
      ["mysql", "mysql5"],
      "--host=localhost",
      "--port=1234",
      "--socket=socket",
      "--user=user",
      "--default-character-set=UTF-8",
      "--ssl-ca=/path/to/ca-cert.pem",
      "--ssl-cert=/path/to/client-cert.pem",
      "--ssl-capath=/path/to/cacerts",
      "--ssl-cipher=DHE-RSA-AES256-SHA",
      "--ssl-key=/path/to/client-key.pem",
      "--ssl-mode=VERIFY_IDENTITY",
      "-p",
      "db",
    ];

    assertFindCmdAndExecCalledWith(args, () => Mysql2Adapter.dbconsole(config));
  });

  it("mysql include password", () => {
    const config = makeDbConfig({
      adapter: "mysql2",
      database: "db",
      username: "user",
      password: "qwerty",
    });

    assertFindCmdAndExecCalledWith(
      [["mysql", "mysql5"], "--user=user", "--password=qwerty", "db"],
      () => Mysql2Adapter.dbconsole(config, { includePassword: true }),
    );
  });

  it("mysql can use alternative cli", () => {
    Base.databaseCli["mysql"] = "mycli";
    try {
      const config = makeDbConfig({ adapter: "mysql2", database: "db", database_cli: "mycli" });

      assertFindCmdAndExecCalledWith(["mycli", "db"], () => Mysql2Adapter.dbconsole(config));
    } finally {
      Base.databaseCli["mysql"] = ["mysql", "mysql5"];
    }
  });
});
