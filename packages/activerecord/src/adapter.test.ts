import { describe, it, expect, vi } from "vitest";
import { AbstractAdapter } from "./connection-adapters/abstract-adapter.js";
import { ConnectionFailed } from "./errors.js";

describe("AdapterTest", () => {
  it.skip("update prepared statement", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: adapter.test.ts has no createTestAdapter/defineSchema setup; Book model (test-fixtures.ts) is defined but not wired here, and null-byte prepared-statement round-trip needs a live DB
    // SCOPE: ~30 LOC port (Book wiring + setup); affects ~1 test
  });
  it.skip("create record with pk as zero", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: adapter.test.ts has no createTestAdapter/defineSchema setup; Book (test-fixtures.ts) is defined but not wired here
    // SCOPE: ~20 LOC port (Book wiring + setup); affects ~1 test
  });
  it.skip("valid column", () => {
    // BLOCKED: schema
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#isValidType: stub returns true for any non-empty string; must consult nativeDatabaseTypes()
    // SCOPE: ~10 LOC + nativeDatabaseTypes fix; affects ~2 tests
  });
  it.skip("invalid column", () => {
    // BLOCKED: schema
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#isValidType: stub returns true for any non-empty string; must return false for types not in nativeDatabaseTypes()
    // SCOPE: ~10 LOC; affects ~2 tests
  });
  it.skip("table exists?", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs accounts table for tableExists round-trip across coercions
    // SCOPE: ~15 LOC port; affects ~1 test
  });
  it.skip("data sources", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs accounts/authors/tasks/topics fixtures for dataSources enumeration
    // SCOPE: ~10 LOC port; affects ~2 tests
  });
  it.skip("indexes", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs accounts table for addIndex/indexes/removeIndex round-trip
    // SCOPE: ~25 LOC port; affects ~3 tests
  });
  it.skip("returns empty indexes for non existing table", () => {
    // BLOCKED: schema
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#indexes: must return [] for unknown tables rather than throw
    // SCOPE: ~5 LOC; affects ~1 test
  });
  it.skip("remove index when name and wrong column name specified", () => {
    // BLOCKED: schema
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#removeIndex: must raise ArgumentError on name + wrong-column mismatch
    // SCOPE: ~15 LOC + fixture; affects ~2 tests
  });
  it.skip("remove index when name and wrong column name specified positional argument", () => {
    // BLOCKED: schema
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#removeIndex: positional column form must raise ArgumentError on mismatch
    // SCOPE: ~15 LOC + fixture; affects ~2 tests
  });
  it.skip("#exec_query queries with no result set return an empty ActiveRecord::Result", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs subscribers table for execQuery INSERT round-trip + empty-result assertions
    // SCOPE: ~15 LOC port; affects ~2 tests
  });
  it.skip("#exec_query queries with an empty result set still return the columns", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs subscribers table for SELECT-with-empty-result column-metadata assertion
    // SCOPE: ~15 LOC port; affects ~2 tests
  });
  it.skip("charset", () => {
    // BLOCKED: adapter-mysql
    // ROOT-CAUSE: connection-adapters/abstract-mysql-adapter.ts#charset: MySQL-only; needs MYSQL_TEST_URL test context
    // SCOPE: ~10 LOC port; affects ~3 tests
  });
  it.skip("show nonexistent variable returns nil", () => {
    // BLOCKED: adapter-mysql
    // ROOT-CAUSE: connection-adapters/abstract-mysql-adapter.ts#showVariable: MySQL-only; needs MYSQL_TEST_URL test context
    // SCOPE: ~5 LOC port; affects ~1 test
  });
  it.skip("not specifying database name for cross database selects", () => {
    // BLOCKED: adapter-mysql
    // ROOT-CAUSE: connection-adapters/abstract-mysql-adapter.ts: MySQL-only cross-DB select via establishConnection + configurations.configsFor
    // SCOPE: ~25 LOC port + ARTest config wiring; affects ~1 test
  });
  it.skip("disable prepared statements", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#preparedStatements getter/setter + connection-handling.ts#establishConnection: no global ActiveRecord.disablePreparedStatements toggle exists to override the per-config prepared_statements:true on (re-)establishConnection
    // SCOPE: ~25 LOC; affects ~1 test
  });
  it.skip("table alias", () => {
    // BLOCKED: schema
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableAliasFor: Ruby per-instance method override (def @connection.test_table_alias_length) has no TS equivalent; needs subclass-based port
    // SCOPE: ~15 LOC port via TestAdapter subclass; affects ~1 test
  });
  it.skip("uniqueness violations are translated to specific exception", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs subscribers table; exercises RecordNotUnique translation from raw INSERT
    // SCOPE: ~15 LOC port; affects ~1 test
  });
  it.skip("not null violations are translated to specific exception", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs Post model with NOT NULL constraints for NotNullViolation translation
    // SCOPE: ~10 LOC port; affects ~1 test
  });
  it.skip("value limit violations are translated to specific exception", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs Event model with limited title column for ValueTooLong translation (non-SQLite only)
    // SCOPE: ~10 LOC port + Event fixture; affects ~1 test
  });
  it.skip("numeric value out of ranges are translated to specific exception", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs Book model; exercises RangeError translation on out-of-range bigint (non-SQLite only)
    // SCOPE: ~10 LOC port; affects ~1 test
  });
  it.skip("exceptions from notifications are not translated", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs posts table + ActiveSupport::Notifications.subscribe equivalent for sql.active_record event
    // SCOPE: ~20 LOC port; affects ~1 test
  });
  it.skip("database related exceptions are translated to statement invalid", () => {
    // BLOCKED: schema
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#execute: must translate raw-SQL parse errors into StatementInvalid
    // SCOPE: ~10 LOC + error-translator wiring; affects ~1 test
  });
  it.skip("select all always return activerecord result", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs posts table; exercises selectAll returning Result instance
    // SCOPE: ~10 LOC port; affects ~1 test
  });
  it.skip("select all insert update delete with casted binds", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs Event model + Arel::Nodes::BindParam round-trip through insert/update/delete/selectAll
    // SCOPE: ~30 LOC port; affects ~2 tests
  });
  it.skip("select all insert update delete with binds", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs Event model + Relation::QueryAttribute bind through insert/update/delete/selectAll
    // SCOPE: ~30 LOC port; affects ~2 tests
  });
  it.skip("select methods passing a association relation", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs Author/Post fixtures + association relation passed to selectOne/All/Value/Values
    // SCOPE: ~20 LOC port; affects ~2 tests
  });
  it.skip("select methods passing a relation", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs Post fixture + relation passed to selectOne/All/Value/Values
    // SCOPE: ~20 LOC port; affects ~2 tests
  });
  it.skip("type_to_sql returns a String for unmapped types", () => {
    // BLOCKED: schema
    // ROOT-CAUSE: connection-adapters/abstract/schema-creation.ts#typeToSql default branch uppercases unknown types; Rails preserves the original symbol-as-string
    // SCOPE: ~5 LOC fix in default branch; affects ~1 test
  });
  it.skip("current database", () => {
    // BLOCKED: adapter-mysql
    // ROOT-CAUSE: connection-adapters/abstract-mysql-adapter.ts#currentDatabase + postgresql-adapter.ts#currentDatabase: needs MySQL/PG test context (Rails respond_to? gate skips on SQLite); test-adapter.ts only exposes PG_TEST_URL/MYSQL_TEST_URL env, no per-config "database" name lookup
    // SCOPE: ~15 LOC port; affects ~1 test
  });
});

describe("AdapterForeignKeyTest", () => {
  it.skip("disable referential integrity", async () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs fk_test_has_pk/has_fk tables for disableReferentialIntegrity block
    // SCOPE: ~20 LOC port + fk_test fixtures; affects ~4 tests
  });
  it.skip("foreign key violations are translated to specific exception with validate false", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs fk_test_has_fk table; InvalidForeignKey translation on save(validate: false)
    // SCOPE: ~15 LOC port; affects ~4 tests
  });
  it.skip("foreign key violations on insert are translated to specific exception", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs fk_test_has_fk table; InvalidForeignKey translation on raw INSERT
    // SCOPE: ~15 LOC port; affects ~4 tests
  });
  it.skip("foreign key violations on delete are translated to specific exception", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs fk_test_has_pk table; InvalidForeignKey translation on raw DELETE
    // SCOPE: ~15 LOC port; affects ~4 tests
  });
});

describe("AdapterTestWithoutTransaction", () => {
  it.skip("create with query cache", () => {
    // BLOCKED: query-cache
    // ROOT-CAUSE: connection-adapters/abstract/query-cache.ts: enableQueryCache!/create cache-invalidation interplay
    // SCOPE: ~20 LOC + posts fixture; affects ~3 tests
  });
  it.skip("truncate", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test-helpers/fixtures: needs posts fixture for adapter#truncate("posts") integration
    // SCOPE: ~15 LOC port; affects ~1 test
  });
  it.skip("truncate with query cache", () => {
    // BLOCKED: query-cache
    // ROOT-CAUSE: connection-adapters/abstract/query-cache.ts: truncate must invalidate query cache after enableQueryCache!
    // SCOPE: ~15 LOC + posts fixture; affects ~3 tests
  });
  it.skip("truncate tables with query cache", () => {
    // BLOCKED: query-cache
    // ROOT-CAUSE: connection-adapters/abstract/query-cache.ts: truncateTables must invalidate query cache across multiple tables
    // SCOPE: ~15 LOC + posts/authors/author_addresses fixtures; affects ~3 tests
  });
  it.skip("reset empty table with custom pk", () => {
    // BLOCKED: adapter-pg
    // ROOT-CAUSE: connection-adapters/postgresql-adapter.ts#resetPkSequence!: PG-only; needs Movie fixture
    // SCOPE: ~15 LOC port + Movie fixture; affects ~2 tests
  });
  it.skip("reset table with non integer pk", () => {
    // BLOCKED: adapter-pg
    // ROOT-CAUSE: connection-adapters/postgresql-adapter.ts#resetPkSequence!: PG-only; needs Subscriber (nick PK) fixture
    // SCOPE: ~15 LOC port + Subscriber fixture; affects ~2 tests
  });
});

describe("AdapterConnectionTest", () => {
  it.skip("reconnect after a disconnect", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts: disconnect!/reconnect!/active? lifecycle wiring
    // SCOPE: ~20 LOC; affects ~17 tests
  });
  it.skip("materialized transaction state is reset after a reconnect", () => {
    // BLOCKED: transactions
    // ROOT-CAUSE: connection-adapters/abstract/transaction.ts: materializeTransactions + reconnect! must reset open-transaction state
    // SCOPE: ~25 LOC; affects ~7 tests
  });
  it.skip("materialized transaction state can be restored after a reconnect", () => {
    // BLOCKED: transactions
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#reconnect!: restoreTransactions: true option not implemented
    // SCOPE: ~25 LOC; affects ~2 tests
  });
  it.skip("materialized transaction state is reset after a disconnect", () => {
    // BLOCKED: transactions
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#disconnect!: must clear materialized transaction state
    // SCOPE: ~15 LOC; affects ~7 tests
  });
  it.skip("unmaterialized transaction state is reset after a reconnect", () => {
    // BLOCKED: transactions
    // ROOT-CAUSE: connection-adapters/abstract/transaction.ts: unmaterialized (lazy) transaction reset after reconnect!
    // SCOPE: ~15 LOC; affects ~7 tests
  });
  it.skip("unmaterialized transaction state can be restored after a reconnect", () => {
    // BLOCKED: transactions
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#reconnect!: restoreTransactions: true for unmaterialized state
    // SCOPE: ~15 LOC; affects ~2 tests
  });
  it.skip("unmaterialized transaction state is reset after a disconnect", () => {
    // BLOCKED: transactions
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#disconnect!: must clear unmaterialized transaction state
    // SCOPE: ~10 LOC; affects ~7 tests
  });
  it.skip("active? detects remote disconnection", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#active?: must detect remote disconnection (MySQL/PG-only test)
    // SCOPE: ~15 LOC; affects ~17 tests
  });
  it.skip("verify! restores after remote disconnection", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#verify!: reconnect-on-failure path
    // SCOPE: ~15 LOC; affects ~17 tests
  });
  it.skip("reconnect! restores after remote disconnection", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#reconnect!: after remote disconnect path
    // SCOPE: ~10 LOC; affects ~17 tests
  });
  it.skip("querying a 'clean' long-failed connection restores and succeeds", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts: clean! + @last_activity backdating + auto-verify-before-query not implemented
    // SCOPE: ~30 LOC; affects ~3 tests
  });
  it.skip("querying a 'clean' recently-used but now-failed connection skips verification", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#clean!: must skip verify on recently-used connection; surface AdapterError
    // SCOPE: ~20 LOC; affects ~3 tests
  });
  it.skip("quoting a string on a 'clean' failed connection will not prevent reconnecting", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#quoteString: must not verify; subsequent query reconnects
    // SCOPE: ~15 LOC; affects ~3 tests
  });
  it.skip("querying after a failed non-retryable query restores and succeeds", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts: non-retryable execute raises ConnectionFailed; next idempotent query reconnects
    // SCOPE: ~20 LOC; affects ~5 tests
  });
  it.skip("idempotent SELECT queries are retried and result in a reconnect", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts: idempotent SELECT auto-retry on ConnectionFailed not implemented
    // SCOPE: ~25 LOC; affects ~5 tests
  });
  it.skip("#find and #find_by queries with known attributes are retried and result in a reconnect", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: relation/finder-methods.ts: find/findBy with known attrs marked retryable on ConnectionFailed
    // SCOPE: ~15 LOC; affects ~5 tests
  });
  it.skip("queries containing SQL fragments are not retried", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: relation/query-methods.ts: raw-SQL where/select/find_by must NOT be marked retryable
    // SCOPE: ~15 LOC; affects ~5 tests
  });
  it.skip("queries containing SQL functions are not retried", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: relation/query-methods.ts: Arel NamedFunction in WHERE must NOT be marked retryable
    // SCOPE: ~10 LOC; affects ~5 tests
  });
  it.skip("transaction restores after remote disconnection", () => {
    // BLOCKED: transactions
    // ROOT-CAUSE: connection-adapters/abstract/transaction.ts: outer transaction must reconnect when raw connection died pre-open
    // SCOPE: ~20 LOC; affects ~3 tests
  });
  it.skip("active transaction is restored after remote disconnection", () => {
    // BLOCKED: transactions
    // ROOT-CAUSE: connection-adapters/abstract/transaction.ts: materializeTransactions + remote disconnect + verify! within outer transaction
    // SCOPE: ~25 LOC; affects ~3 tests
  });
  it.skip("dirty transaction cannot be restored after remote disconnection", () => {
    // BLOCKED: transactions
    // ROOT-CAUSE: connection-adapters/abstract/transaction.ts: dirty (post-write) transaction must raise ConnectionFailed and not retry block
    // SCOPE: ~20 LOC; affects ~3 tests
  });
  it("can reconnect and retry queries under limit when retry deadline is set", async () => {
    const a = new AbstractAdapter();
    (a as any)._config.retryDeadline = 0.1;
    const reconnectSpy = vi.spyOn(a, "reconnectBang");
    let attempts = 0;
    await expect(
      a.withRawConnection({ allowRetry: true }, async () => {
        if (attempts === 0) {
          attempts++;
          throw new ConnectionFailed("Something happened to the connection");
        }
      }),
    ).resolves.toBeUndefined();
    expect(attempts).toBe(1);
    expect(reconnectSpy).toHaveBeenCalledOnce();
  });
  it("does not reconnect and retry queries when retries are disabled", async () => {
    const a = new AbstractAdapter();
    let attempts = 0;
    await expect(
      a.withRawConnection(async () => {
        if (attempts === 0) {
          attempts++;
          throw new ConnectionFailed("Something happened to the connection");
        }
      }),
    ).rejects.toBeInstanceOf(ConnectionFailed);
    expect(attempts).toBe(1);
  });
  it("does not reconnect and retry queries that exceed retry deadline", async () => {
    vi.useFakeTimers();
    try {
      const a = new AbstractAdapter();
      (a as any)._config.retryDeadline = 0.1; // 100ms
      let attempts = 0;
      // Start the call — the block awaits a fake setTimeout so it won't
      // settle until we advance the clock. Pre-attach a no-op catch so vitest
      // doesn't surface it as an unhandled rejection while the clock advances.
      const promise = a.withRawConnection({ allowRetry: true }, async () => {
        if (attempts === 0) {
          await new Promise<void>((r) => setTimeout(r, 200)); // 200ms fake sleep
          attempts++;
          throw new ConnectionFailed("Something happened to the connection");
        }
      });

      promise.catch(() => {});
      // Advancing 200ms fires the block's setTimeout and moves Date.now()
      // past the 100ms retryDeadline, so the catch branch sees expired=true.
      await vi.advanceTimersByTimeAsync(200);
      await expect(promise).rejects.toBeInstanceOf(ConnectionFailed);
      expect(attempts).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
  it.skip("#execute is retryable", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#execute: allowRetry: true must reconnect on remote kill
    // SCOPE: ~20 LOC; affects ~5 tests
  });
  it.skip("disconnect and recover on #configure_connection failure", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#configureConnection: failure recovery via pool.new_connection
    // SCOPE: ~25 LOC; affects ~1 test
  });
});

describe("AdapterThreadSafetyTest", () => {
  it.skip("#active? is synchronized", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — gvl
  });
  it.skip("#verify! is synchronized", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — gvl
  });
});

describe("AdvisoryLocksEnabledTest", () => {
  it.skip("advisory locks enabled?", () => {
    // BLOCKED: adapter-pg
    // ROOT-CAUSE: connection-adapters/abstract-adapter.ts#isAdvisoryLocksEnabled (currently hardcoded false): PG override + establishConnection(advisory_locks:) config plumbing not wired
    // SCOPE: ~15 LOC port; affects ~1 test
  });
});

describe("InvalidateTransactionTest", () => {
  it.skip("invalidates transaction on rollback error", () => {
    // BLOCKED: transactions
    // ROOT-CAUSE: connection-adapters/abstract/transaction.ts: currentTransaction#invalidated? after Deadlocked inside withRawConnection
    // SCOPE: ~15 LOC; affects ~1 test
  });
});
