import { it, expect, vi } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import { setTrailsRoot, trailsRoot } from "@blazetrails/activesupport";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { Base } from "../../base.js";
import { SQLite3Adapter } from "../../connection-adapters/sqlite3-adapter.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import type { DatabaseConfigOptions } from "../../database-configurations/database-config.js";

describeIfSqlite("SQLite3DbConsoleTest", () => {
  const root = (path: string) => File.expandPath(path, trailsRoot() ?? undefined);

  const makeDbConfig = (config: Record<string, unknown>) =>
    new HashConfig("test", "primary", config as DatabaseConfigOptions);

  const assertFindCmdAndExecCalledWith = (args: unknown[], block: () => unknown) => {
    const spy = vi.spyOn(SQLite3Adapter, "findCmdAndExec").mockImplementation(() => []);
    try {
      block();
      expect(spy).toHaveBeenCalledWith(...args);
    } finally {
      spy.mockRestore();
    }
  };

  it("sqlite3", () => {
    const config = makeDbConfig({ adapter: "sqlite3", database: "db.sqlite3" });

    assertFindCmdAndExecCalledWith(["sqlite3", root("db.sqlite3")], () =>
      SQLite3Adapter.dbconsole(config),
    );
  });

  it("sqlite3 mode", () => {
    const config = makeDbConfig({ adapter: "sqlite3", database: "db.sqlite3" });

    assertFindCmdAndExecCalledWith(["sqlite3", "-html", root("db.sqlite3")], () =>
      SQLite3Adapter.dbconsole(config, { mode: "html" }),
    );
  });

  it("sqlite3 header", () => {
    const config = makeDbConfig({ adapter: "sqlite3", database: "db.sqlite3" });

    assertFindCmdAndExecCalledWith(["sqlite3", "-header", root("db.sqlite3")], () =>
      SQLite3Adapter.dbconsole(config, { header: true }),
    );
  });

  it("sqlite3 db absolute path", () => {
    const config = makeDbConfig({ adapter: "sqlite3", database: "/tmp/db.sqlite3" });

    assertFindCmdAndExecCalledWith(["sqlite3", "/tmp/db.sqlite3"], () =>
      SQLite3Adapter.dbconsole(config),
    );
  });

  it("sqlite3 db with defined rails root", () => {
    const config = makeDbConfig({ adapter: "sqlite3", database: "config/db.sqlite3" });

    const original = trailsRoot();
    setTrailsRoot("/srv/app");
    try {
      assertFindCmdAndExecCalledWith(["sqlite3", "/srv/app/config/db.sqlite3"], () =>
        SQLite3Adapter.dbconsole(config),
      );
    } finally {
      setTrailsRoot(original);
    }
  });

  it("sqlite3 can use alternative cli", () => {
    Base.databaseCli["sqlite"] = "sqlitecli";
    try {
      const config = makeDbConfig({
        adapter: "sqlite3",
        database: "config/db.sqlite3",
        database_cli: "sqlitecli",
      });

      assertFindCmdAndExecCalledWith(["sqlitecli", root("config/db.sqlite3")], () =>
        SQLite3Adapter.dbconsole(config),
      );
    } finally {
      Base.databaseCli["sqlite"] = "sqlite3";
    }
  });
});
