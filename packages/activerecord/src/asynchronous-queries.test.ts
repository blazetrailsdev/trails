import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";
import { ThreadPoolExecutor } from "@blazetrails/ruby-compat";
import {
  asyncQueryExecutor,
  setAsyncQueryExecutor,
  setGlobalExecutorConcurrency,
} from "./active-record.js";
import { Base } from "./base.js";
import type { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ConnectionPool } from "./connection-adapters/abstract/connection-pool.js";
import { ConnectionHandler } from "./connection-adapters/abstract/connection-handler.js";
import { HashConfig } from "./database-configurations/hash-config.js";
import { AsynchronousQueryInsideTransactionError, StatementInvalid } from "./errors.js";
import { FutureResult } from "./future-result.js";
import { Result } from "./result.js";
import { inMemoryDb } from "./support/adapter-helper.js";
import { cleanUpConnectionHandler } from "./cases/helper.js";
import { fixtures } from "./test-fixtures.js";
import { ARUnit2Model } from "./test-helpers/models/arunit2-model.js";

function asynchronousQueriesSharedTests(connection: () => AbstractAdapter): void {
  it("async select failure", async () => {
    if (inMemoryDb()) {
      await expect(async () =>
        connection().selectAll("SELECT * FROM does_not_exists", null, [], { async: true }),
      ).rejects.toThrow(StatementInvalid);
    } else {
      const futureResult = connection().selectAll("SELECT * FROM does_not_exists", null, [], {
        async: true,
      }) as unknown as FutureResult;
      expect(futureResult).toBeInstanceOf(FutureResult);
      await expect(futureResult.result()).rejects.toThrow(StatementInvalid);
    }
  });

  it("async query from transaction", async () => {
    expect(() => {
      void connection().selectAll("SELECT * FROM posts", null, [], { async: true });
    }).not.toThrow();

    if (!inMemoryDb()) {
      await connection().transaction(async () => {
        expect(() => {
          void connection().selectAll("SELECT * FROM posts", null, [], { async: true });
        }).toThrow(AsynchronousQueryInsideTransactionError);
      });
    }
  });

  it("async query cache", async () => {
    connection().enableQueryCacheBang();
    try {
      await connection().selectAll("SELECT * FROM posts");
      const result = connection().selectAll("SELECT * FROM posts", null, [], { async: true });
      expect(result.constructor).toEqual(FutureResult.Complete);
    } finally {
      connection().disableQueryCacheBang();
    }
  });

  it("async query foreground fallback", async () => {
    const status: { executed?: boolean; async?: unknown } = {};

    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.sql === "SELECT * FROM does_not_exists") {
        status.executed = true;
        status.async = event.payload.async;
      }
    });

    try {
      const stub = vi
        .spyOn(connection().pool as ConnectionPool, "scheduleQuery")
        .mockImplementation(() => {});
      try {
        if (inMemoryDb()) {
          await expect(async () =>
            connection().selectAll("SELECT * FROM does_not_exists", null, [], { async: true }),
          ).rejects.toThrow(StatementInvalid);
        } else {
          const futureResult = connection().selectAll("SELECT * FROM does_not_exists", null, [], {
            async: true,
          }) as unknown as FutureResult;
          expect(futureResult).toBeInstanceOf(FutureResult);
          await expect(futureResult.result()).rejects.toThrow(StatementInvalid);
        }
      } finally {
        stub.mockRestore();
      }

      expect(status.executed).toEqual(true);
      expect(status.async).toEqual(false);
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });
}

async function waitForFutureResult(result: FutureResult): Promise<void> {
  for (let i = 0; i < 500; i++) {
    if (!result.pending()) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe("AsynchronousQueriesTest", () => {
  fixtures({}, { useTransactionalTests: false });

  let connection: AbstractAdapter;

  beforeEach(async () => {
    connection = await Base.leaseConnection();
  });

  asynchronousQueriesSharedTests(() => connection);

  it("async select all", async () => {
    const status: { executed?: boolean; async?: unknown } = {};

    const subscriber = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
      if (event.payload.sql === "SELECT * FROM posts") {
        status.executed = true;
        status.async = event.payload.async;
      }
    });

    try {
      const futureResult = connection.selectAll("SELECT * FROM posts", null, [], {
        async: true,
      }) as unknown as FutureResult;

      if (inMemoryDb()) {
        expect(futureResult).toBeInstanceOf(FutureResult.Complete);
      } else {
        expect(futureResult).toBeInstanceOf(FutureResult);
        await waitForFutureResult(futureResult);
      }

      expect(await futureResult.result()).toBeInstanceOf(Result);
      expect(status.async).toEqual(connection.supportsConcurrentConnections());
    } finally {
      if (subscriber) Notifications.unsubscribe(subscriber);
    }
  });
});

describe("AsynchronousQueriesWithTransactionalTest", () => {
  fixtures({});

  let connection: AbstractAdapter;

  beforeEach(async () => {
    connection = await Base.leaseConnection();
    await connection.materializeTransactions();
  });

  asynchronousQueriesSharedTests(() => connection);
});

describe("AsynchronousExecutorTypeTest", () => {
  fixtures({});

  const asyncExecutor = (pool: unknown) =>
    (pool as { asyncExecutor: ThreadPoolExecutor | null }).asyncExecutor;

  let handler: ConnectionHandler | undefined;

  afterEach(async () => {
    for (const pool of handler?.connectionPoolList("all") ?? []) await pool.disconnect();
    handler = undefined;
  });

  it("null configuration uses a single null executor by default", async () => {
    const oldValue = asyncQueryExecutor();
    setAsyncQueryExecutor(null);
    try {
      handler = new ConnectionHandler();
      const dbConfig = Base.configurations().configsFor({ envName: "arunit", name: "primary" })!;
      const dbConfig2 = Base.configurations().configsFor({ envName: "arunit2", name: "primary" })!;
      const pool1 = await handler.establishConnection(dbConfig);
      const pool2 = await handler.establishConnection(dbConfig2, { ownerName: ARUnit2Model });

      const asyncPool1 = asyncExecutor(pool1);
      const asyncPool2 = asyncExecutor(pool2);

      expect(asyncPool1).toBeNull();
      expect(asyncPool2).toBeNull();

      expect(handler.connectionPoolList("all").length).toEqual(2);
    } finally {
      cleanUpConnectionHandler();
      setAsyncQueryExecutor(oldValue);
    }
  });

  it("one global thread pool is used when set with default concurrency", async () => {
    const oldValue = asyncQueryExecutor();
    setAsyncQueryExecutor("global_thread_pool");
    try {
      handler = new ConnectionHandler();
      const dbConfig = Base.configurations().configsFor({ envName: "arunit", name: "primary" })!;
      const dbConfig2 = Base.configurations().configsFor({ envName: "arunit2", name: "primary" })!;
      const pool1 = await handler.establishConnection(dbConfig);
      const pool2 = await handler.establishConnection(dbConfig2, { ownerName: ARUnit2Model });

      const asyncPool1 = asyncExecutor(pool1)!;
      const asyncPool2 = asyncExecutor(pool2)!;

      expect(asyncPool1 instanceof ThreadPoolExecutor).toBeTruthy();
      expect(asyncPool2 instanceof ThreadPoolExecutor).toBeTruthy();

      expect(asyncPool1.minLength).toEqual(0);
      expect(asyncPool1.maxLength).toEqual(4);
      expect(asyncPool1.maxQueue).toEqual(16);
      expect(asyncPool1.fallbackPolicy).toEqual("caller_runs");

      expect(asyncPool2.minLength).toEqual(0);
      expect(asyncPool2.maxLength).toEqual(4);
      expect(asyncPool2.maxQueue).toEqual(16);
      expect(asyncPool2.fallbackPolicy).toEqual("caller_runs");

      expect(handler.connectionPoolList("all").length).toEqual(2);
      expect(asyncPool2).toBe(asyncPool1);
    } finally {
      cleanUpConnectionHandler();
      setAsyncQueryExecutor(oldValue);
    }
  });

  it.skip("concurrency can be set on global thread pool", () => {});

  it("concurrency cannot be set with null executor or multi thread pool", () => {
    const oldValue = asyncQueryExecutor();
    try {
      setAsyncQueryExecutor(null);

      expect(() => {
        setGlobalExecutorConcurrency(8);
      }).toThrow(ArgumentError);

      setAsyncQueryExecutor("multi_thread_pool");

      expect(() => {
        setGlobalExecutorConcurrency(8);
      }).toThrow(ArgumentError);
    } finally {
      setAsyncQueryExecutor(oldValue);
    }
  });

  it("multi thread pool executor configuration", async () => {
    const oldValue = asyncQueryExecutor();
    setAsyncQueryExecutor("multi_thread_pool");
    try {
      handler = new ConnectionHandler();
      const configHash = Base.configurations().configsFor({
        envName: "arunit",
        name: "primary",
      })!.configurationHash;
      const newConfigHash = { ...configHash, minThreads: 0, maxThreads: 10 };
      const dbConfig = new HashConfig("arunit", "primary", newConfigHash);
      const dbConfig2 = Base.configurations().configsFor({ envName: "arunit2", name: "primary" })!;
      const pool1 = await handler.establishConnection(dbConfig);
      const pool2 = await handler.establishConnection(dbConfig2, { ownerName: ARUnit2Model });

      const asyncPool1 = asyncExecutor(pool1)!;
      const asyncPool2 = asyncExecutor(pool2)!;

      expect(asyncPool1 instanceof ThreadPoolExecutor).toBeTruthy();
      expect(asyncPool2 instanceof ThreadPoolExecutor).toBeTruthy();

      expect(asyncPool1.minLength).toEqual(0);
      expect(asyncPool1.maxLength).toEqual(10);
      expect(asyncPool1.maxQueue).toEqual(40);
      expect(asyncPool1.fallbackPolicy).toEqual("caller_runs");

      expect(asyncPool2.minLength).toEqual(0);
      expect(asyncPool2.maxLength).toEqual(5);
      expect(asyncPool2.maxQueue).toEqual(20);
      expect(asyncPool2.fallbackPolicy).toEqual("caller_runs");

      expect(handler.connectionPoolList("all").length).toEqual(2);
      expect(asyncPool2).not.toBe(asyncPool1);
    } finally {
      cleanUpConnectionHandler();
      setAsyncQueryExecutor(oldValue);
    }
  });

  it("multi thread pool is used only by configurations that enable it", async () => {
    const oldValue = asyncQueryExecutor();
    setAsyncQueryExecutor("multi_thread_pool");
    try {
      handler = new ConnectionHandler();

      const configHash1 = Base.configurations().configsFor({
        envName: "arunit",
        name: "primary",
      })!.configurationHash;
      const newConfig1 = { ...configHash1, minThreads: 0, maxThreads: 10 };
      const dbConfig1 = new HashConfig("arunit", "primary", newConfig1);

      const configHash2 = Base.configurations().configsFor({
        envName: "arunit2",
        name: "primary",
      })!.configurationHash;
      const newConfig2 = { ...configHash2, minThreads: 0, maxThreads: 0 };
      const dbConfig2 = new HashConfig("arunit2", "primary", newConfig2);

      const pool1 = await handler.establishConnection(dbConfig1);
      const pool2 = await handler.establishConnection(dbConfig2, { ownerName: ARUnit2Model });

      const asyncPool1 = asyncExecutor(pool1)!;
      const asyncPool2 = asyncExecutor(pool2);

      expect(asyncPool1 instanceof ThreadPoolExecutor).toBeTruthy();
      expect(asyncPool2).toBeNull();

      expect(asyncPool1.minLength).toEqual(0);
      expect(asyncPool1.maxLength).toEqual(10);
      expect(asyncPool1.maxQueue).toEqual(40);
      expect(asyncPool1.fallbackPolicy).toEqual("caller_runs");

      expect(handler.connectionPoolList("all").length).toEqual(2);
      expect(asyncPool2).not.toBe(asyncPool1);
    } finally {
      cleanUpConnectionHandler();
      setAsyncQueryExecutor(oldValue);
    }
  });
});
