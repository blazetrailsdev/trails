import { describe, it } from "vitest";

describe("AdapterTest", () => {
  it.skip("update prepared statement", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("create record with pk as zero", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("valid column", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("invalid column", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("table exists?", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("data sources", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("indexes", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("returns empty indexes for non existing table", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("remove index when name and wrong column name specified", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("remove index when name and wrong column name specified positional argument", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("#exec_query queries with no result set return an empty ActiveRecord::Result", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("#exec_query queries with an empty result set still return the columns", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("charset", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("show nonexistent variable returns nil", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("not specifying database name for cross database selects", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("disable prepared statements", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("table alias", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("uniqueness violations are translated to specific exception", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("not null violations are translated to specific exception", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("value limit violations are translated to specific exception", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("numeric value out of ranges are translated to specific exception", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("exceptions from notifications are not translated", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("database related exceptions are translated to statement invalid", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("select all always return activerecord result", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("select all insert update delete with casted binds", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("select all insert update delete with binds", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("select methods passing a association relation", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("select methods passing a relation", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("type_to_sql returns a String for unmapped types", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("current database", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
});

describe("AdapterForeignKeyTest", () => {
  it.skip("disable referential integrity", async () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("foreign key violations are translated to specific exception with validate false", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("foreign key violations on insert are translated to specific exception", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("foreign key violations on delete are translated to specific exception", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
});

describe("AdapterTestWithoutTransaction", () => {
  it.skip("create with query cache", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("truncate", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("truncate with query cache", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("truncate tables with query cache", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("reset empty table with custom pk", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("reset table with non integer pk", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
});

describe("AdapterConnectionTest", () => {
  it.skip("reconnect after a disconnect", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("materialized transaction state is reset after a reconnect", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("materialized transaction state can be restored after a reconnect", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("materialized transaction state is reset after a disconnect", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("unmaterialized transaction state is reset after a reconnect", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("unmaterialized transaction state can be restored after a reconnect", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("unmaterialized transaction state is reset after a disconnect", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("active? detects remote disconnection", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("verify! restores after remote disconnection", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("reconnect! restores after remote disconnection", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("querying a 'clean' long-failed connection restores and succeeds", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("querying a 'clean' recently-used but now-failed connection skips verification", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("quoting a string on a 'clean' failed connection will not prevent reconnecting", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("querying after a failed non-retryable query restores and succeeds", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("idempotent SELECT queries are retried and result in a reconnect", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("#find and #find_by queries with known attributes are retried and result in a reconnect", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("queries containing SQL fragments are not retried", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("queries containing SQL functions are not retried", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("transaction restores after remote disconnection", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("active transaction is restored after remote disconnection", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("dirty transaction cannot be restored after remote disconnection", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("can reconnect and retry queries under limit when retry deadline is set", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("does not reconnect and retry queries when retries are disabled", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("does not reconnect and retry queries that exceed retry deadline", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("#execute is retryable", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("disconnect and recover on #configure_connection failure", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
});

describe("AdapterThreadSafetyTest", () => {
  it.skip("#active? is synchronized", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
  it.skip("#verify! is synchronized", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
});

describe("AdvisoryLocksEnabledTest", () => {
  it.skip("advisory locks enabled?", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
});

describe("InvalidateTransactionTest", () => {
  it.skip("invalidates transaction on rollback error", () => {
    // BLOCKED: schema — abstract adapter schema introspection / query execution gap
    // ROOT-CAUSE: connection-adapters/abstract/schema-statements.ts#tableExists/indexes/dataSources or abstract-adapter.ts#execQuery not fully implemented
    // SCOPE: ~100 LOC across abstract/schema-statements.ts + abstract-adapter.ts; affects ~70 tests in adapter.test.ts
  });
});
