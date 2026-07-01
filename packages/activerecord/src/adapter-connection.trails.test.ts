/**
 * Trails-only adapter connection/lifecycle unit coverage (RFC 0048).
 *
 * These guard trails-internal behavior with no counterpart in Rails'
 * `AdapterConnectionTest` (adapter_test.rb): the retryable-classification
 * threading through the Arel collector, `findBySql`'s null-opts tolerance,
 * the `execQuery` options type, `withRawConnection` reentrancy, and the
 * `AbstractAdapter#reconnectBang` / `#verifyBang` lifecycle driven directly
 * against a base-controlled fake adapter (independent of a concrete adapter's
 * raw-connection wiring).
 *
 * They live in a `*.trails.test.ts` file so `test:compare` does not map them
 * to a Rails test name — the faithful, integration-level `AdapterConnectionTest`
 * port lives in `adapter.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { Nodes } from "@blazetrails/arel";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { AdapterError, ConnectionFailed } from "./errors.js";
import { Base } from "./index.js";
import { Result } from "./result.js";

class LifecycleTestAdapter extends AbstractAdapter {
  private _connected = false;

  // The abstract quoteColumnName raises NotImplementedError (mirrors Rails —
  // every adapter must define its own). These test adapters compile real SQL
  // through Arel, so provide an ANSI quoter like a concrete adapter would.
  override quoteColumnName(name: string): string {
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

  override get active(): boolean {
    return this._connected;
  }

  override reconnectBang(opts: { restoreTransactions?: boolean } = {}): Promise<void> {
    this._connected = true;
    this._connection = this;
    return super.reconnectBang(opts);
  }
}

// Adapter that intercepts selectAll to capture allowRetry and simulate reconnects.
class QueryTestAdapter extends LifecycleTestAdapter {
  capturedAllowRetry: boolean | undefined;
  failOnce = false;

  override async selectAll(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    opts?: { allowRetry?: boolean },
  ): Promise<Result> {
    this.capturedAllowRetry = opts?.allowRetry ?? false;
    return this.withRawConnection({ allowRetry: opts?.allowRetry ?? false }, async () => {
      if (this.failOnce) {
        this.failOnce = false;
        throw new ConnectionFailed("remote disconnect");
      }
      return Result.fromRowHashes([]);
    });
  }
}

// Minimal Post model for retryable-classification tests.
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

    // The raw-SQL WHERE makes the SELECT non-retryable. from() takes a
    // retryable Arel node, which _toSqlWithoutSetOp compiles a second time
    // through the shared visitor — that compile must not clobber the
    // already-captured classification (regression: collector reset).
    const fromNode = new Nodes.SqlLiteral("posts", { retryable: true });
    await PostForRetryTest.where("1 = 1").from(fromNode).limit(1);
    expect(adapter.capturedAllowRetry).toBe(false);

    // A fully retryable query with a from(Arel node) stays retryable.
    await PostForRetryTest.where({ id: 1 }).from(fromNode).limit(1);
    expect(adapter.capturedAllowRetry).toBe(true);

    // A non-retryable FROM node lowers the classification even when the rest
    // of the SELECT is retryable — Rails compiles the whole arel through one
    // collector, so the raw FROM fragment makes allow_retry false.
    const rawFromNode = new Nodes.SqlLiteral("posts");
    await PostForRetryTest.where({ id: 1 }).from(rawFromNode).limit(1);
    expect(adapter.capturedAllowRetry).toBe(false);

    // from(Relation) compiles its subquery separately too — a non-retryable
    // fragment inside the subquery must lower the outer classification.
    const rawSubquery = PostForRetryTest.where("1 = 1");
    await PostForRetryTest.where({ id: 1 }).from(rawSubquery, "sub").limit(1);
    expect(adapter.capturedAllowRetry).toBe(false);

    // A set-operation subquery now compiles as a live compound node through the
    // outer collector, so its operands' retryability flows to the outer query
    // (no longer forced non-retryable by per-side string concatenation): a union
    // of two retryable SELECTs stays retryable.
    const retryableSetOp = PostForRetryTest.where({ id: 1 }).union(
      PostForRetryTest.where({ id: 2 }),
    );
    await PostForRetryTest.where({ id: 1 }).from(retryableSetOp, "sub").limit(1);
    expect(adapter.capturedAllowRetry).toBe(true);

    // A non-retryable operand (raw SQL) lowers the outer classification through
    // that same single collector.
    const mixedSetOp = PostForRetryTest.where("1 = 1").union(PostForRetryTest.where({ id: 2 }));
    await PostForRetryTest.where({ id: 1 }).from(mixedSetOp, "sub").limit(1);
    expect(adapter.capturedAllowRetry).toBe(false);
  });

  it("findBySql tolerates a null opts argument without throwing", async () => {
    const adapter = new QueryTestAdapter();
    adapter.simulateConnect();
    PostForRetryTest.adapter = adapter as unknown as DatabaseAdapter;

    await expect(PostForRetryTest.findBySql("SELECT * FROM posts", [], null)).resolves.toEqual([]);
  });

  it("execQuery options type accepts allowRetry alongside prepare", () => {
    const opts: NonNullable<Parameters<DatabaseAdapter["execQuery"]>[3]> = {
      prepare: true,
      allowRetry: true,
    };
    expect(opts.allowRetry).toBe(true);
  });

  it("withRawConnection is reentrant", async () => {
    // Rails' with_raw_connection runs under a reentrant Monitor and is
    // documented to re-enter (abstract_adapter.rb:972-981): materialize_
    // transactions re-enters, and the yielded block can too (e.g. a write
    // path's exec_restart_db_transaction → execute). A nested call on the same
    // chain must run directly, not queue behind the held lock and deadlock.
    const a = new AbstractAdapter();
    let innerRan = false;
    const result = await a.withRawConnection(async () => {
      await a.withRawConnection(async () => {
        innerRan = true;
      });
      return "outer";
    });
    expect(innerRan).toBe(true);
    expect(result).toBe("outer");
  });
});

// Drives AbstractAdapter#reconnectBang / #verifyBang lifecycle directly,
// independent of a concrete adapter's raw-connection wiring. Mirrors the
// observable effects of Rails' `reconnect!` / `verify!` / `configure_connection`
// chain (abstract_adapter.rb).
class ReconnectLifecycleAdapter extends AbstractAdapter {
  configureCalls = 0;
  clearCacheCalls = 0;
  disconnectCalls = 0;
  failConfigure = false;
  reconnectCalls = 0;
  // Number of leading reconnect() calls that should throw before succeeding.
  reconnectFailures = 0;
  // Error thrown by the failing reconnect() attempts.
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
    // Initial attempt plus connectionRetries (2) retries.
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
