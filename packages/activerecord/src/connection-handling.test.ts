import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import { ActiveRecordError } from "./errors.js";
import { deprecator } from "./deprecator.js";
import { assertDeprecated, assertNotDeprecated } from "@blazetrails/activesupport";
import { HashConfig } from "./database-configurations/hash-config.js";
import { DatabaseConfigurations } from "./database-configurations.js";
import { fixtures } from "./test-fixtures.js";
import { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
import { Post } from "./test-helpers/models/post.js";
import { Relation } from "./relation.js";
import { stripThenable } from "@blazetrails/activesupport";
import { connectedToStack } from "./core.js";
import { restoreWorkerConnection } from "./support/connection.js";
import { DEFAULT_ENV } from "./connection-handling.js";
import { permanentConnectionCheckout, setPermanentConnectionCheckout } from "./active-record.js";

describe("ConnectionHandlingTest", () => {
  fixtures(["posts"], {
    usesTransaction: [
      "common APIs don't permanently hold a connection when permanent checkout is deprecated or disallowed",
    ],
  });

  let permanentConnectionCheckoutWas: true | "deprecated" | "disallowed";

  beforeEach(() => {
    permanentConnectionCheckoutWas = permanentConnectionCheckout();
  });

  afterEach(async () => {
    setPermanentConnectionCheckout(permanentConnectionCheckoutWas);
    connectedToStack().length = 0;
    await Post.where({ title: "foo" }).deleteAll();
  });

  it("#with_connection lease the connection for the duration of the block", async () => {
    Base.releaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();

    await Base.withConnection(() => {
      expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
    });

    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();
  });

  it("#lease_connection makes the lease permanent even inside #with_connection", async () => {
    Base.releaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();

    let conn: unknown = null;
    await Base.withConnection(async (connection) => {
      conn = connection;
      expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
      for (let i = 0; i < 2; i++) {
        expect(await Base.leaseConnection()).toBe(connection);
      }
    });

    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
    expect(await Base.leaseConnection()).toBe(conn);
  });

  it("#lease_connection makes the lease permanent even inside #with_connection(prevent_permanent_checkout: true)", async () => {
    Base.releaseConnection();
    await Base.withConnection(
      async (connection) => {
        expect(await Base.leaseConnection()).toBe(connection);
      },
      { preventPermanentCheckout: true },
    );
    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();
  });

  it("#with_connection use the already leased connection if available", async () => {
    const leasedConnection = await Base.leaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();

    await Base.withConnection(async (connection) => {
      expect(connection).toBe(leasedConnection);
      expect(await Base.leaseConnection()).toBe(connection);
    });

    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
    expect(await Base.leaseConnection()).toBe(leasedConnection);
  });

  it("#with_connection is reentrant", async () => {
    const leasedConnection = await Base.leaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();

    await Base.withConnection(async (connection) => {
      expect(connection).toBe(leasedConnection);
      expect(await Base.leaseConnection()).toBe(connection);

      await Base.withConnection(async (connection2) => {
        expect(connection2).toBe(leasedConnection);
        expect(await Base.leaseConnection()).toBe(connection2);
      });
    });

    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
    expect(await Base.leaseConnection()).toBe(leasedConnection);
  });

  it("#connection is a soft-deprecated alias to #lease_connection", async () => {
    setPermanentConnectionCheckout(true);

    Base.releaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();

    let conn: unknown = null;
    await Base.withConnection(async (connection) => {
      conn = connection;
      expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
      for (let i = 0; i < 2; i++) {
        expect(await Base.connection).toBe(connection);
      }
    });

    expect(Base.connectionPool().isActiveConnection()).toBeTruthy();
    expect(await Base.connection).toBe(conn);

    Base.releaseConnection();
  });

  it("#connection emits a deprecation warning if ActiveRecord.permanent_connection_checkout == :deprecated", async () => {
    setPermanentConnectionCheckout("deprecated");

    Base.releaseConnection();

    await assertDeprecated(deprecator(), async () => {
      await Base.connection;
    });

    await assertNotDeprecated(deprecator(), async () => {
      await Base.connection;
    });

    Base.releaseConnection();

    await assertDeprecated(deprecator(), async () => {
      await Base.connection;
    });

    Base.releaseConnection();

    await Base.withConnection(async () => {
      await assertDeprecated(deprecator(), async () => {
        await Base.connection;
      });
    });
  });

  it("#connection raises an error if ActiveRecord.permanent_connection_checkout == :disallowed", async () => {
    setPermanentConnectionCheckout("disallowed");
    Base.releaseConnection();

    await expect(Base.connection).rejects.toThrow(ActiveRecordError);

    await Base.withConnection(async () => {
      await expect(Base.connection).rejects.toThrow(ActiveRecordError);
    });

    await Base.leaseConnection();
    await expect(Base.connection).resolves.not.toThrow();
    Base.releaseConnection();
  });

  it("#connection doesn't make the lease permanent if inside #with_connection(prevent_permanent_checkout: true)", async () => {
    setPermanentConnectionCheckout("disallowed");
    Base.releaseConnection();

    await Base.withConnection(
      async (connection) => {
        expect(await Base.connection).toBe(connection);
      },
      { preventPermanentCheckout: true },
    );

    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();
  });

  it("common APIs don't permanently hold a connection when permanent checkout is deprecated or disallowed", async () => {
    setPermanentConnectionCheckout("deprecated");
    Base.releaseConnection();
    expect(Base.connectionPool().isActiveConnection()).toBeFalsy();

    await Post.createBang({ title: "foo", body: "bar" });
    expect(Post.connectionPool().isActiveConnection()).toBeFalsy();

    await Post.first();
    expect(Post.connectionPool().isActiveConnection()).toBeFalsy();

    await Post.count();
    expect(Post.connectionPool().isActiveConnection()).toBeFalsy();
  });
});

describe("withRoleAndShard loads Relation return values within scope (Story K gap 5)", () => {
  fixtures({}, { useTransactionalTests: false });

  it("calls .load() on a Relation returned from the block", async () => {
    const { withRoleAndShard } = await import("./connection-handling.js");
    let loadCalled = false;
    const fakeRelation = Object.assign(Object.create(Relation.prototype), {
      load() {
        loadCalled = true;
        return Promise.resolve(stripThenable(this));
      },
    });

    class FakeModel extends Base {}

    await withRoleAndShard.call(FakeModel as any, undefined, undefined, false, () => fakeRelation);

    expect(loadCalled).toBe(true);
  });

  it("does not call .load() on non-Relation return values", async () => {
    const { withRoleAndShard } = await import("./connection-handling.js");
    class FakeModel extends Base {}

    const result = await withRoleAndShard.call(
      FakeModel as any,
      undefined,
      undefined,
      false,
      () => 42,
    );

    expect(result).toBe(42);
  });

  it("an overlapping async block removes its own entry when it settles first", async () => {
    const { withRoleAndShard } = await import("./connection-handling.js");
    class FakeModel extends Base {}
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const seen: (string | undefined)[] = [];

    const outer = withRoleAndShard.call(FakeModel as any, "outer", undefined, false, async () => {
      await Promise.resolve();
    });
    const inner = withRoleAndShard.call(FakeModel as any, "inner", undefined, false, async () => {
      await gate;
      seen.push(connectedToStack().at(-1)?.role);
    });
    await outer;
    release();
    await inner;

    expect(seen).toEqual(["inner"]);
    expect(connectedToStack().some((entry) => entry.role === "outer")).toBe(false);
    expect(connectedToStack().some((entry) => entry.role === "inner")).toBe(false);
  });

  it("connected_to_many raises ArgumentError without a role", () => {
    class AbstractConn extends Base {}
    expect(() => Base.connectedToMany([AbstractConn], {} as never, () => {})).toThrow(
      "missing keyword: :role",
    );
  });

  it("calls .load() on a Relation returned from an async block", async () => {
    const { withRoleAndShard } = await import("./connection-handling.js");
    let loadCalled = false;
    const fakeRelation = Object.assign(Object.create(Relation.prototype), {
      load() {
        loadCalled = true;
        return Promise.resolve(stripThenable(this));
      },
    });

    class FakeModel extends Base {}

    await withRoleAndShard.call(FakeModel as any, undefined, undefined, false, async () =>
      stripThenable(fakeRelation),
    );

    expect(loadCalled).toBe(true);
  });
});

describe("AbstractAdapter#isPreventingWrites stack matching", () => {
  afterEach(async () => {
    connectedToStack().length = 0;
    for (const name of ["UnrelatedAbstract", "AnimalsRecord", "MealsRecord"]) {
      await Base.connectionHandler.removeConnectionPool(name);
    }
  });

  it("Base.connectedTo preventing writes applies globally to unrelated pools", async () => {
    class UnrelatedAbstract extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
    }
    await Base.connectionHandler.establishConnection(
      new HashConfig("test", "UnrelatedAbstract", { adapter: "sqlite3", database: ":memory:" }),
      { ownerName: "UnrelatedAbstract", role: "writing" },
    );
    const conn = await UnrelatedAbstract.leaseConnection();
    expect(conn.isPreventingWrites()).toBe(false);
    Base.connectedTo({ role: "writing", preventWrites: true }, () => {
      expect(conn.isPreventingWrites()).toBe(true);
    });
    expect(conn.isPreventingWrites()).toBe(false);
  });

  it("abstract-class connectedTo does not leak to unrelated pools", async () => {
    class AnimalsRecord extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
        this.connectionSpecificationName = "AnimalsRecord";
      }
    }
    class MealsRecord extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
        this.connectionSpecificationName = "MealsRecord";
      }
    }
    await Base.connectionHandler.establishConnection(
      new HashConfig("test", "AnimalsRecord", { adapter: "sqlite3", database: ":memory:" }),
      { ownerName: "AnimalsRecord", role: "writing" },
    );
    await Base.connectionHandler.establishConnection(
      new HashConfig("test", "MealsRecord", { adapter: "sqlite3", database: ":memory:" }),
      { ownerName: "MealsRecord", role: "writing" },
    );
    const animals = await AnimalsRecord.leaseConnection();
    const meals = await MealsRecord.leaseConnection();
    AnimalsRecord.connectedTo({ role: "writing", preventWrites: true }, () => {
      expect(animals.isPreventingWrites()).toBe(true);
      expect(meals.isPreventingWrites()).toBe(false);
    });
  });

  it("primary class connectedTo (after connectsTo) targets the Base-normalized pool", async () => {
    class ApplicationRecord extends Base {
      static {
        this.abstractClass = true;
        this.connectionClass = true;
      }
      static override isPrimaryClass(): boolean {
        return true;
      }
    }
    const handler = new ConnectionHandler();
    const appPool = await handler.establishConnection(
      new HashConfig("test", "ApplicationRecord", { adapter: "sqlite3", database: ":memory:" }),
      { ownerName: ApplicationRecord, role: "writing" },
    );
    const otherPool = await handler.establishConnection(
      new HashConfig("test", "OtherAbstract", { adapter: "sqlite3", database: ":memory:" }),
      { ownerName: "OtherAbstract", role: "writing" },
    );
    try {
      const appConn = await appPool.leaseConnection();
      const otherConn = await otherPool.leaseConnection();
      ApplicationRecord.connectedTo({ role: "writing", preventWrites: true }, () => {
        expect(appConn.isPreventingWrites()).toBe(true);
        expect(otherConn.isPreventingWrites()).toBe(false);
      });
    } finally {
      await handler.clearAllConnectionsBang();
    }
  });
});

describe("resolveConfigForConnection / connectsTo with unset configurations", () => {
  let prevBaseConfigs: DatabaseConfigurations;

  beforeEach(async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    prevBaseConfigs = Base.configurations();
  });

  afterEach(async () => {
    const { DatabaseConfigurations } = await import("./database-configurations.js");
    Base.configurations(prevBaseConfigs);
    await Base.connectionHandler.clearAllConnectionsBang();
    delete (Base as any)._connectionSpecificationName;
    await restoreWorkerConnection();
  });

  it("unknown string config name raises AdapterNotSpecified with available-configs hint", async () => {
    const { resolveConfigForConnection } = await import("./connection-handling.js");
    const { AdapterNotSpecified } = await import("./errors.js");
    class Untouched extends Base {
      static {
        this.abstractClass = true;
      }
    }
    expect(() => resolveConfigForConnection.call(Untouched, ":missing_env")).toThrow(
      AdapterNotSpecified,
    );
    expect(() => resolveConfigForConnection.call(Untouched, ":missing_env")).toThrow(
      /`missing_env` database is not configured/,
    );
    expect(() => resolveConfigForConnection.call(Untouched, ":missing_env")).toThrow(
      /Available database configurations are:/,
    );
  });

  it("connectsTo plants _connectionSpecificationName (primary class normalizes to 'Base')", async () => {
    const { __resetPrimaryAbstractClass, primaryAbstractClass } = await import("./inheritance.js");
    let priorConfigs: ReturnType<typeof Base.configurations> | undefined;
    class AppRecord extends Base {}
    class SecondaryAbstract extends Base {
      static {
        this.abstractClass = true;
      }
    }
    try {
      __resetPrimaryAbstractClass();
      primaryAbstractClass(AppRecord);
      const env = DEFAULT_ENV();
      priorConfigs = Base.configurations();
      Base.configurations({
        [env]: { primary: { adapter: "sqlite3", database: "db/primary.sqlite3" } },
      });

      await AppRecord.connectsTo({ database: { writing: ":primary" } });
      expect((AppRecord as any)._connectionSpecificationName).toBe("ActiveRecord::Base");

      await SecondaryAbstract.connectsTo({ database: { writing: ":primary" } });
      expect((SecondaryAbstract as any)._connectionSpecificationName).toBe("SecondaryAbstract");
    } finally {
      await SecondaryAbstract.removeConnection();
      __resetPrimaryAbstractClass();
      if (priorConfigs) Base.configurations(priorConfigs);
      await restoreWorkerConnection();
    }
  });
});

describe("establish_connection accepts a DatabaseConfig", () => {
  class CapturedConfigModel extends Base {}

  afterEach(async () => {
    await CapturedConfigModel.removeConnection();
  });

  it("re-establishes the connection from the captured DatabaseConfig object", async () => {
    const config = new HashConfig("test", "primary", {
      adapter: "sqlite3",
      database: "db/primary.sqlite3",
      pool: 5,
      reapingFrequency: null,
    });
    await Base.connectionHandler.establishConnection(config, { ownerName: "CapturedConfigModel" });
    CapturedConfigModel.connectionSpecificationName = "CapturedConfigModel";

    const captured = (await CapturedConfigModel.removeConnection())!;
    expect(captured).toBeInstanceOf(HashConfig);

    await CapturedConfigModel.establishConnection(captured);

    const restored = CapturedConfigModel.connectionDbConfig();
    expect(restored).toBe(captured);
    expect(restored.adapter).toBe("sqlite3");
    expect(restored.configurationHash.database).toBe("db/primary.sqlite3");
  });
});
