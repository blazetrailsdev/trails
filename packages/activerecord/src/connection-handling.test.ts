import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Base } from "./base.js";
import { ActiveRecordError } from "./errors.js";
import { deprecator } from "./deprecator.js";
import { assertDeprecated, assertNotDeprecated } from "@blazetrails/activesupport";
import { fixtures } from "./test-fixtures.js";
import { Post } from "./test-helpers/models/post.js";
import { connectedToStack } from "./core.js";
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
