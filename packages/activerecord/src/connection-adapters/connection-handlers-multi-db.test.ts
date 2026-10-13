import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Concurrent, Tempfile, Thread, setEnv } from "@blazetrails/ruby-compat";
import { ArgumentError } from "@blazetrails/activemodel";
import { assertRaises, getEnv } from "@blazetrails/activesupport";
import { ConnectionNotDefined } from "../errors.js";
import { ConnectionHandler } from "./abstract/connection-handler.js";
import { Base } from "../base.js";
import { currentRole } from "../core.js";
import { cleanUpConnectionHandler } from "../cases/helper.js";
import { inMemoryDb } from "../support/adapter-helper.js";
import { Person } from "../test-helpers/models/person.js";
import { fixtures } from "../test-fixtures.js";
import { readingRole, setReadingRole, setWritingRole, writingRole } from "../active-record.js";

describe("ConnectionHandlersMultiDbTest", () => {
  let handler: ConnectionHandler;
  let connectionName: string;
  let rwPool: any;
  let roPool: any;
  let prevConfigs: ReturnType<typeof Base.configurations>;

  fixtures(["people"], { useTransactionalTests: false });

  beforeEach(async () => {
    handler = new ConnectionHandler();
    connectionName = "ActiveRecord::Base";
    const dbConfig = Base.configurations().configsFor({ envName: "arunit", name: "primary" })!;
    rwPool = await handler.establishConnection(dbConfig);
    roPool = await handler.establishConnection(dbConfig, { role: "reading" });
  });

  afterEach(() => {
    cleanUpConnectionHandler();
  });

  class SecondaryBase extends Base {
    static {
      this.abstractClass = true;
    }
  }

  class MultiConnectionTestModel extends SecondaryBase {
    declare connection_role: string;
  }

  it("multiple connections works in a threaded environment", async () => {
    const tfWriting = Tempfile.open("test_writing");
    const tfReading = Tempfile.open("test_reading");

    try {
      await SecondaryBase.connectsTo({
        database: {
          writing: { database: tfWriting.path(), adapter: "sqlite3" },
          secondary: { database: tfReading.path(), adapter: "sqlite3" },
        },
      });

      await (
        await MultiConnectionTestModel.leaseConnection()
      ).execute("CREATE TABLE `multi_connection_test_models` (connection_role VARCHAR (255))");
      await (
        await MultiConnectionTestModel.leaseConnection()
      ).execute("INSERT INTO multi_connection_test_models VALUES ('writing')");

      await Base.connectedTo({ role: "secondary" }, async () => {
        await (
          await MultiConnectionTestModel.leaseConnection()
        ).execute("CREATE TABLE `multi_connection_test_models` (connection_role VARCHAR (255))");
        await (
          await MultiConnectionTestModel.leaseConnection()
        ).execute("INSERT INTO multi_connection_test_models VALUES ('reading')");
      });

      const readLatch = new Concurrent.CountDownLatch();
      const writeLatch = new Concurrent.CountDownLatch();

      await MultiConnectionTestModel.leaseConnection();

      const thread = new Thread(async () => {
        await MultiConnectionTestModel.leaseConnection();

        await writeLatch.wait();
        expect(
          await (
            await MultiConnectionTestModel.leaseConnection()
          ).selectValue("SELECT connection_role from multi_connection_test_models"),
        ).toBe("writing");
        readLatch.countDown();
      });

      await Base.connectedTo({ role: "secondary" }, async () => {
        writeLatch.countDown();
        expect(
          await (
            await MultiConnectionTestModel.leaseConnection()
          ).selectValue("SELECT connection_role from multi_connection_test_models"),
        ).toBe("reading");
        await readLatch.wait();
      });

      await thread.join();
    } finally {
      tfReading.close();
      tfReading.unlink();
      tfWriting.close();
      tfWriting.unlink();
    }
  });

  it("loading relations with multi db connections", async () => {
    await SecondaryBase.connectsTo({
      database: {
        writing: { database: ":memory:", adapter: "sqlite3" },
        secondary: { database: ":memory:", adapter: "sqlite3" },
      },
    });

    const relation = await Base.connectedTo({ role: "secondary" }, async () => {
      await (
        await MultiConnectionTestModel.leaseConnection()
      ).execute("CREATE TABLE `multi_connection_test_models` (connection_role VARCHAR (255))");
      await MultiConnectionTestModel.createBang({ connection_role: "reading" });
      return MultiConnectionTestModel.where({ connection_role: "reading" }).load();
    });

    expect((await relation.first())!.connection_role).toBe("reading");
  });

  it.skipIf(inMemoryDb())("establish connection using 3 levels config", async () => {
    const previousEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "default_env");

    const config = {
      default_env: {
        readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3", replica: true },
        default: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      },
    };
    prevConfigs = Base.configurations();
    Base.configurations(config);
    try {
      await Base.connectsTo({ database: { writing: ":default", reading: ":readonly" } });

      let pool = Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base");
      expect(pool).not.toBeNull();
      expect(pool!.dbConfig.database).toEqual("test/db/primary.sqlite3");
      expect(pool!.dbConfig.name).toEqual("default");

      pool = Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base", {
        role: "reading",
      });
      expect(pool).not.toBeNull();
      expect(pool!.dbConfig.database).toEqual("test/db/readonly.sqlite3");
      expect(pool!.dbConfig.name).toEqual("readonly");
    } finally {
      Base.configurations(prevConfigs);
      await Base.establishConnection(":arunit");
      setEnv("TRAILS_ENV", previousEnv);
    }
  });

  it.skipIf(inMemoryDb())("switching connections via handler", async () => {
    const previousEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "default_env");

    const config = {
      default_env: {
        readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3" },
        primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      },
    };
    prevConfigs = Base.configurations();
    Base.configurations(config);
    try {
      await Base.connectsTo({ database: { writing: ":primary", reading: ":readonly" } });

      await Base.connectedTo({ role: "reading" }, async () => {
        expect(currentRole.call(Base as any)).toEqual("reading");
        expect(Base.isConnectedTo({ role: "reading" })).toBeTruthy();
        expect(Base.isConnectedTo({ role: "writing" })).toBeFalsy();
        expect((await Base.leaseConnection()).isPreventingWrites()).toBeTruthy();
      });

      await Base.connectedTo({ role: "writing" }, async () => {
        expect(currentRole.call(Base as any)).toEqual("writing");
        expect(Base.isConnectedTo({ role: "writing" })).toBeTruthy();
        expect(Base.isConnectedTo({ role: "reading" })).toBeFalsy();
        expect((await Base.leaseConnection()).isPreventingWrites()).toBeFalsy();
      });
    } finally {
      Base.configurations(prevConfigs);
      await Base.establishConnection(":arunit");
      setEnv("TRAILS_ENV", previousEnv);
    }
  });

  it.skipIf(inMemoryDb())(
    "establish connection using 3 levels config with non default handlers",
    async () => {
      const previousEnv = getEnv("TRAILS_ENV");
      setEnv("TRAILS_ENV", "default_env");

      const config = {
        default_env: {
          readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3" },
          primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
        },
      };
      prevConfigs = Base.configurations();
      Base.configurations(config);
      try {
        await Base.connectsTo({ database: { default: ":primary", readonly: ":readonly" } });

        let pool = Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base", {
          role: "default",
        });
        expect(pool).not.toBeNull();
        expect(pool!.dbConfig.database).toEqual("test/db/primary.sqlite3");

        pool = Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base", {
          role: "readonly",
        });
        expect(pool).not.toBeNull();
        expect(pool!.dbConfig.database).toEqual("test/db/readonly.sqlite3");
      } finally {
        Base.configurations(prevConfigs);
        await Base.establishConnection(":arunit");
        setEnv("TRAILS_ENV", previousEnv);
      }
    },
  );

  it.skipIf(inMemoryDb())("switching connections with database url", async () => {
    const previousEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "default_env");
    const previousUrl = getEnv("DATABASE_URL");
    setEnv("DATABASE_URL", "postgres://localhost/foo");

    try {
      await Base.connectsTo({ database: { writing: "postgres://localhost/bar" } });
      expect(currentRole.call(Base as any)).toEqual("writing");
      expect(Base.isConnectedTo({ role: "writing" })).toBeTruthy();

      const handler = Base.connectionHandler;
      expect(Base.connectionHandler).toEqual(handler);

      const pool = handler.retrieveConnectionPool("ActiveRecord::Base");
      expect(pool).not.toBeNull();
      expect(pool!.dbConfig.configurationHash).toEqual({
        adapter: "postgresql",
        database: "bar",
        host: "localhost",
      });
    } finally {
      await Base.establishConnection(":arunit");
      setEnv("TRAILS_ENV", previousEnv);
      setEnv("DATABASE_URL", previousUrl);
    }
  });

  it.skipIf(inMemoryDb())("switching connections with database config hash", async () => {
    const previousEnv = getEnv("TRAILS_ENV");
    setEnv("TRAILS_ENV", "default_env");
    const config = { adapter: "sqlite3", database: "test/db/readonly.sqlite3" };

    try {
      await Base.connectsTo({ database: { writing: config } });
      expect(currentRole.call(Base as any)).toEqual("writing");
      expect(Base.isConnectedTo({ role: "writing" })).toBeTruthy();

      const handler = Base.connectionHandler;
      expect(Base.connectionHandler).toEqual(handler);

      const pool = handler.retrieveConnectionPool("ActiveRecord::Base");
      expect(pool).not.toBeNull();
      expect(pool!.dbConfig.configurationHash).toEqual(config);
    } finally {
      await Base.establishConnection(":arunit");
      setEnv("TRAILS_ENV", previousEnv);
    }
  });

  it.skipIf(inMemoryDb())("switching connections without database and role raises", () => {
    let error: any;
    expect(() => {
      try {
        Base.connectedTo({}, () => {});
      } catch (e) {
        error = e;
        throw e;
      }
    }).toThrow(ArgumentError);
    expect(error.message).toEqual("must provide a `shard` and/or `role`.");
  });

  it.skipIf(inMemoryDb())(
    "switching connections with database symbol uses default role",
    async () => {
      const previousEnv = getEnv("TRAILS_ENV");
      setEnv("TRAILS_ENV", "default_env");

      const config = {
        default_env: {
          animals: { adapter: "sqlite3", database: "test/db/animals.sqlite3" },
          primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
        },
      };
      prevConfigs = Base.configurations();
      Base.configurations(config);
      try {
        await Base.connectsTo({ database: { writing: ":animals" } });
        expect(currentRole.call(Base as any)).toEqual("writing");
        expect(Base.isConnectedTo({ role: "writing" })).toBeTruthy();

        const handler = Base.connectionHandler;
        expect(Base.connectionHandler).toEqual(handler);

        const pool = handler.retrieveConnectionPool("ActiveRecord::Base");
        expect(pool).not.toBeNull();
        expect(pool!.dbConfig.configurationHash).toEqual(config.default_env.animals);
      } finally {
        Base.configurations(prevConfigs);
        await Base.establishConnection(":arunit");
        setEnv("TRAILS_ENV", previousEnv);
      }
    },
  );

  it.skipIf(inMemoryDb())(
    "switching connections with database hash uses passed role and database",
    async () => {
      const previousEnv = getEnv("TRAILS_ENV");
      setEnv("TRAILS_ENV", "default_env");

      const config = {
        default_env: {
          animals: { adapter: "sqlite3", database: "test/db/animals.sqlite3" },
          primary: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
        },
      };
      prevConfigs = Base.configurations();
      Base.configurations(config);
      try {
        await Base.connectsTo({ database: { writing: ":primary" } });
        expect(currentRole.call(Base as any)).toEqual("writing");
        expect(Base.isConnectedTo({ role: "writing" })).toBeTruthy();

        const handler = Base.connectionHandler;
        expect(Base.connectionHandler).toEqual(handler);

        const pool = handler.retrieveConnectionPool("ActiveRecord::Base");
        expect(pool).not.toBeNull();
        expect(pool!.dbConfig.configurationHash).toEqual(config.default_env.primary);
      } finally {
        Base.configurations(prevConfigs);
        await Base.establishConnection(":arunit");
        setEnv("TRAILS_ENV", previousEnv);
      }
    },
  );

  it.skipIf(inMemoryDb())("connects to with single configuration", async () => {
    const config = {
      development: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
    };
    prevConfigs = Base.configurations();
    Base.configurations(config);

    try {
      await Base.connectsTo({ database: { writing: ":development" } });

      expect(Base.connectionHandler).toEqual(Base.connectionHandler);
      expect(currentRole.call(Base as any)).toEqual("writing");
      expect(Base.isConnectedTo({ role: "writing" })).toBeTruthy();
    } finally {
      Base.configurations(prevConfigs);
      await Base.establishConnection(":arunit");
    }
  });

  it.skipIf(inMemoryDb())("connects to using top level key in two level config", async () => {
    const config = {
      development: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      development_readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3" },
    };
    prevConfigs = Base.configurations();
    Base.configurations(config);

    try {
      await Base.connectsTo({
        database: { writing: ":development", reading: ":development_readonly" },
      });

      const pool = Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base", {
        role: "reading",
      });
      expect(pool).not.toBeNull();
      expect(pool!.dbConfig.database).toEqual("test/db/readonly.sqlite3");
    } finally {
      Base.configurations(prevConfigs);
      await Base.establishConnection(":arunit");
    }
  });

  it.skipIf(inMemoryDb())("connects to returns array of established connections", async () => {
    const config = {
      development: { adapter: "sqlite3", database: "test/db/primary.sqlite3" },
      development_readonly: { adapter: "sqlite3", database: "test/db/readonly.sqlite3" },
    };
    prevConfigs = Base.configurations();
    Base.configurations(config);

    try {
      const result = await Base.connectsTo({
        database: { writing: ":development", reading: ":development_readonly" },
      });

      expect(result).toEqual([
        Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base"),
        Base.connectionHandler.retrieveConnectionPool("ActiveRecord::Base", { role: "reading" }),
      ]);
    } finally {
      Base.configurations(prevConfigs);
      await Base.establishConnection(":arunit");
    }
  });

  it("connection pool list", () => {
    expect(handler.connectionPoolList("writing")).toEqual([rwPool]);
    expect(handler.connectionPoolList("reading")).toEqual([roPool]);
    expect(handler.connectionPoolList()).toEqual([rwPool, roPool]);
  });

  it("retrieve connection", async () => {
    expect(await handler.retrieveConnection(connectionName)).toBeTruthy();
    expect(await handler.retrieveConnection(connectionName, { role: "reading" })).toBeTruthy();
  });

  it("active connections?", async () => {
    expect(handler.hasActiveConnections()).toBeFalsy();

    expect(await handler.retrieveConnection(connectionName)).toBeTruthy();
    expect(await handler.retrieveConnection(connectionName, { role: "reading" })).toBeTruthy();

    expect(handler.hasActiveConnections()).toBeTruthy();

    handler.clearActiveConnectionsBang("writing");

    expect(handler.hasActiveConnections()).toBeTruthy();

    handler.clearActiveConnectionsBang("all");

    expect(handler.hasActiveConnections()).toBeFalsy();
  });

  it("retrieve connection pool", () => {
    expect(handler.retrieveConnectionPool(connectionName)).not.toBeNull();
    expect(handler.retrieveConnectionPool(connectionName, { role: "reading" })).not.toBeNull();
  });

  it("retrieve connection pool with invalid id", () => {
    expect(handler.retrieveConnectionPool("foo")).toBeUndefined();
    expect(handler.retrieveConnectionPool("foo", { role: "reading" })).toBeUndefined();
  });

  it("calling connected to on a non existent handler raises", async () => {
    const error = await assertRaises([ConnectionNotDefined], {}, () =>
      Base.connectedTo({ role: "non_existent" }, async () => {
        await Person.first();
      }),
    );

    expect(error.message).toEqual("No database connection defined for 'non_existent' role.");
  });

  it("default handlers are writing and reading", () => {
    expect(writingRole()).toBe("writing");
    expect(readingRole()).toBe("reading");
  });

  it("an application can change the default handlers", () => {
    const oldWriting = writingRole();
    const oldReading = readingRole();
    try {
      setWritingRole("default");
      setReadingRole("readonly");
      expect(writingRole()).toBe("default");
      expect(readingRole()).toBe("readonly");
    } finally {
      setWritingRole(oldWriting);
      setReadingRole(oldReading);
    }
  });
});
