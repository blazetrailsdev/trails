import { describe, it, expect } from "vitest";
import { Nodes } from "@blazetrails/arel";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { AdapterError, ConnectionFailed } from "./errors.js";
import { Base } from "./index.js";
import { Result } from "./result.js";
import { adapterType } from "./test-adapter.js";

class LifecycleTestAdapter extends AbstractAdapter {
  private _connected = false;

  static override quoteColumnName(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  simulateConnect(): void {
    this._connected = true;
    this._connection = this;
    this.verifiedBang();
  }

  remoteDisconnect(): void {
    this._connected = false;
  }

  override async active(): Promise<boolean> {
    return this._connected;
  }

  override async dataSources(): Promise<string[]> {
    return [];
  }

  override reconnectBang(opts: { restoreTransactions?: boolean } = {}): Promise<void> {
    this._connected = true;
    this._connection = this;
    return super.reconnectBang(opts);
  }
}

class QueryTestAdapter extends LifecycleTestAdapter {
  capturedAllowRetry: boolean | undefined;
  failOnce = false;

  override async selectAll(
    arel: unknown,
    name?: string | null,
    binds?: unknown[],
    opts?: { allowRetry?: boolean; preparable?: boolean | null },
  ): Promise<Result> {
    const [, , , allowRetry] = (
      this as unknown as {
        toSqlAndBinds(
          arel: unknown,
          binds: unknown[],
          preparable: boolean | null,
          allowRetry: boolean,
        ): [string, unknown[], boolean | null, boolean];
      }
    ).toSqlAndBinds(arel, binds ?? [], opts?.preparable ?? null, opts?.allowRetry ?? false);
    this.capturedAllowRetry = allowRetry;
    return this.withRawConnection({ allowRetry }, async () => {
      if (this.failOnce) {
        this.failOnce = false;
        throw new ConnectionFailed("remote disconnect");
      }
      return Result.fromRowHashes([]);
    });
  }
}

class PostForRetryTest extends Base {
  static {
    this.attribute("title", "string");
    this.attribute("tags_count", "integer");
  }
}

describe("AdapterConnection retryable classification (trails-only)", () => {
  it("a from(Arel node) clause does not reset the SELECT's retryable classification", async () => {
    const adapter = new QueryTestAdapter();
    adapter.simulateConnect();
    PostForRetryTest.adapter = adapter as unknown as DatabaseAdapter;

    const fromNode = new Nodes.SqlLiteral("posts", { retryable: true });
    await PostForRetryTest.where("1 = 1").from(fromNode).limit(1);
    expect(adapter.capturedAllowRetry).toBe(false);

    await PostForRetryTest.where({ id: 1 }).from(fromNode).limit(1);
    expect(adapter.capturedAllowRetry).toBe(true);

    const rawFromNode = new Nodes.SqlLiteral("posts");
    await PostForRetryTest.where({ id: 1 }).from(rawFromNode).limit(1);
    expect(adapter.capturedAllowRetry).toBe(false);

    const rawSubquery = PostForRetryTest.where("1 = 1");
    await PostForRetryTest.where({ id: 1 }).from(rawSubquery, "sub").limit(1);
    expect(adapter.capturedAllowRetry).toBe(false);
  });

  it("findBySql tolerates a null opts argument without throwing", async () => {
    const adapter = new QueryTestAdapter();
    adapter.simulateConnect();
    PostForRetryTest.adapter = adapter as unknown as DatabaseAdapter;

    await expect(PostForRetryTest.findBySql("SELECT * FROM posts", [], null)).resolves.toEqual([]);
  });

  it("withRawConnection is reentrant", async () => {
    const a = new AbstractAdapter();
    let innerRan = false;
    const result = await a.withRawConnection({}, async () => {
      await a.withRawConnection({}, async () => {
        innerRan = true;
      });
      return "outer";
    });
    expect(innerRan).toBe(true);
    expect(result).toBe("outer");
  });
});

class ReconnectLifecycleAdapter extends AbstractAdapter {
  configureCalls = 0;
  clearCacheCalls = 0;
  disconnectCalls = 0;
  failConfigure = false;
  reconnectCalls = 0;
  reconnectFailures = 0;
  reconnectError: () => Error = () => new ConnectionFailed("connection reset");

  override reconnect(): void {
    this.reconnectCalls++;
    if (this.reconnectFailures > 0) {
      this.reconnectFailures--;
      throw this.reconnectError();
    }
  }

  override configureConnection(): void {
    this.configureCalls++;
    if (this.failConfigure) throw new ConnectionFailed("configure_connection failed");
  }
  override clearCacheBang(): void {
    this.clearCacheCalls++;
  }
  override disconnectBang(): void {
    this.disconnectCalls++;
    super.disconnectBang();
  }
  attachRawConnection(): void {
    this._connection = this;
  }
}

describe("AbstractAdapter reconnect/verify lifecycle", () => {
  it("reconnectBang re-enables lazy transactions, clears the cache, and reconfigures", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    await a.transactionManager.disableLazyTransactionsBang();
    expect(a.transactionManager.isLazyTransactionsEnabled()).toBe(false);

    await a.reconnectBang();

    expect(a.transactionManager.isLazyTransactionsEnabled()).toBe(true);
    expect(a.clearCacheCalls).toBe(1);
    expect(a.configureCalls).toBe(1);
    expect((a as unknown as { _verified: boolean })._verified).toBe(true);
    expect((a as unknown as { _rawConnectionDirty: boolean })._rawConnectionDirty).toBe(false);
  });

  it("reconnectBang with restoreTransactions keeps an open transaction open", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    await a.transactionManager.beginTransaction();
    expect(a.isTransactionOpen()).toBe(true);

    await a.reconnectBang({ restoreTransactions: true });
    expect(a.isTransactionOpen()).toBe(true);
  });

  it("reconnectBang without restoreTransactions discards open transactions", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    await a.transactionManager.beginTransaction();
    expect(a.isTransactionOpen()).toBe(true);

    await a.reconnectBang();
    expect(a.isTransactionOpen()).toBe(false);
  });

  it("reconnectBang clears verified/last-activity state when reconfigure fails", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    a.failConfigure = true;

    await expect(a.reconnectBang()).rejects.toBeInstanceOf(ConnectionFailed);
    expect((a as unknown as { _verified: boolean })._verified).toBe(false);
    expect((a as unknown as { _lastActivity: number })._lastActivity).toBe(0);
  });

  it("reconnect! retries a transient connection failure and succeeds", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    (a as unknown as { _config: { connectionRetries: number } })._config.connectionRetries = 2;
    (a as unknown as { backoff: () => Promise<void> }).backoff = () => Promise.resolve();
    a.reconnectFailures = 1;

    await a.reconnectBang();

    expect(a.reconnectCalls).toBe(2);
    expect((a as unknown as { _verified: boolean })._verified).toBe(true);
    expect(a.configureCalls).toBe(1);
  });

  it("reconnect! gives up after exhausting connection retries", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    (a as unknown as { _config: { connectionRetries: number } })._config.connectionRetries = 2;
    (a as unknown as { backoff: () => Promise<void> }).backoff = () => Promise.resolve();
    a.reconnectFailures = 99;

    await expect(a.reconnectBang()).rejects.toBeInstanceOf(ConnectionFailed);
    expect(a.reconnectCalls).toBe(3);
    expect((a as unknown as { _verified: boolean })._verified).toBe(false);
    expect((a as unknown as { _lastActivity: number })._lastActivity).toBe(0);
  });

  it("reconnect! does not retry a non-retryable error", async () => {
    const a = new ReconnectLifecycleAdapter();
    a.attachRawConnection();
    (a as unknown as { _config: { connectionRetries: number } })._config.connectionRetries = 3;
    (a as unknown as { backoff: () => Promise<void> }).backoff = () => Promise.resolve();
    a.reconnectFailures = 1;
    a.reconnectError = () => new AdapterError("syntax error");

    await expect(a.reconnectBang()).rejects.toBeInstanceOf(AdapterError);
    expect(a.reconnectCalls).toBe(1);
    expect((a as unknown as { _verified: boolean })._verified).toBe(false);
  });

  it("verifyBang promotes an unconfigured connection instead of reconnecting", async () => {
    const a = new ReconnectLifecycleAdapter();
    const raw = {} as unknown as AbstractAdapter;
    (a as unknown as { _unconfiguredConnection: AbstractAdapter | null })._unconfiguredConnection =
      raw;

    await a.verifyBang();

    expect((a as unknown as { _connection: AbstractAdapter | null })._connection).toBe(raw);
    expect(
      (a as unknown as { _unconfiguredConnection: AbstractAdapter | null })._unconfiguredConnection,
    ).toBeNull();
    expect(a.configureCalls).toBe(1);
    expect((a as unknown as { _verified: boolean })._verified).toBe(true);
  });

  it("verifyBang disconnects and raises when configuring an unconfigured connection fails", async () => {
    const a = new ReconnectLifecycleAdapter();
    (a as unknown as { _unconfiguredConnection: AbstractAdapter | null })._unconfiguredConnection =
      {} as unknown as AbstractAdapter;
    a.failConfigure = true;

    await expect(a.verifyBang()).rejects.toBeInstanceOf(ConnectionFailed);
    expect(a.disconnectCalls).toBe(1);
    expect((a as unknown as { _verified: boolean })._verified).toBe(false);
  });
});

describe("AbstractAdapter#isValidType spelling (trails-only)", () => {
  it.runIf(adapterType === "postgres")("rejects a camelCase spelling of a native type", () => {
    const conn = Base.connection;
    expect(conn.isValidType("bit_varying")).toBe(true);
    expect(conn.isValidType("bitVarying")).toBe(false);
  });

  it("rejects a camelCase spelling of primary_key", () => {
    const conn = Base.connection;
    expect(conn.isValidType("primary_key")).toBe(true);
    expect(conn.isValidType("primaryKey")).toBe(false);
  });
});
