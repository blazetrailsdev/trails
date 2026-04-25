import { describe, it } from "vitest";

describe("AdapterTest", () => {
  it.skip("update prepared statement", () => {});
  it.skip("create record with pk as zero", () => {});
  it.skip("valid column", () => {});
  it.skip("invalid column", () => {});
  it.skip("table exists?", () => {});
  it.skip("data sources", () => {});
  it.skip("indexes", () => {});
  it.skip("returns empty indexes for non existing table", () => {});
  it.skip("remove index when name and wrong column name specified", () => {});
  it.skip("remove index when name and wrong column name specified positional argument", () => {});
  it.skip("#exec_query queries with no result set return an empty ActiveRecord::Result", () => {});
  it.skip("#exec_query queries with an empty result set still return the columns", () => {});
  it.skip("charset", () => {});
  it.skip("show nonexistent variable returns nil", () => {});
  it.skip("not specifying database name for cross database selects", () => {});
  it.skip("disable prepared statements", () => {});
  it.skip("table alias", () => {});
  it.skip("uniqueness violations are translated to specific exception", () => {});
  it.skip("not null violations are translated to specific exception", () => {});
  it.skip("value limit violations are translated to specific exception", () => {});
  it.skip("numeric value out of ranges are translated to specific exception", () => {});
  it.skip("exceptions from notifications are not translated", () => {});
  it.skip("database related exceptions are translated to statement invalid", () => {});
  it.skip("select all always return activerecord result", () => {});
  it.skip("select all insert update delete with casted binds", () => {});
  it.skip("select all insert update delete with binds", () => {});
  it.skip("select methods passing a association relation", () => {});
  it.skip("select methods passing a relation", () => {});
  it.skip("type_to_sql returns a String for unmapped types", () => {});
  it.skip("current database", () => {});
});

describe("AdapterForeignKeyTest", () => {
  it.skip("disable referential integrity", async () => {});
  it.skip("foreign key violations are translated to specific exception with validate false", () => {});
  it.skip("foreign key violations on insert are translated to specific exception", () => {});
  it.skip("foreign key violations on delete are translated to specific exception", () => {});
});

describe("AdapterTestWithoutTransaction", () => {
  it.skip("create with query cache", () => {});
  it.skip("truncate", () => {});
  it.skip("truncate with query cache", () => {});
  it.skip("truncate tables with query cache", () => {});
  it.skip("reset empty table with custom pk", () => {});
  it.skip("reset table with non integer pk", () => {});
});

describe("AdapterConnectionTest", () => {
  it.skip("reconnect after a disconnect", () => {});
  it.skip("materialized transaction state is reset after a reconnect", () => {});
  it.skip("materialized transaction state can be restored after a reconnect", () => {});
  it.skip("materialized transaction state is reset after a disconnect", () => {});
  it.skip("unmaterialized transaction state is reset after a reconnect", () => {});
  it.skip("unmaterialized transaction state can be restored after a reconnect", () => {});
  it.skip("unmaterialized transaction state is reset after a disconnect", () => {});
  it.skip("active? detects remote disconnection", () => {});
  it.skip("verify! restores after remote disconnection", () => {});
  it.skip("reconnect! restores after remote disconnection", () => {});
  it.skip("querying a 'clean' long-failed connection restores and succeeds", () => {});
  it.skip("querying a 'clean' recently-used but now-failed connection skips verification", () => {});
  it.skip("quoting a string on a 'clean' failed connection will not prevent reconnecting", () => {});
  it.skip("querying after a failed non-retryable query restores and succeeds", () => {});
  it.skip("idempotent SELECT queries are retried and result in a reconnect", () => {});
  it.skip("#find and #find_by queries with known attributes are retried and result in a reconnect", () => {});
  it.skip("queries containing SQL fragments are not retried", () => {});
  it.skip("queries containing SQL functions are not retried", () => {});
  it.skip("transaction restores after remote disconnection", () => {});
  it.skip("active transaction is restored after remote disconnection", () => {});
  it.skip("dirty transaction cannot be restored after remote disconnection", () => {});
  it.skip("can reconnect and retry queries under limit when retry deadline is set", () => {});
  it.skip("does not reconnect and retry queries when retries are disabled", () => {});
  it.skip("does not reconnect and retry queries that exceed retry deadline", () => {});
  it.skip("#execute is retryable", () => {});
  it.skip("disconnect and recover on #configure_connection failure", () => {});
});

describe("AdapterThreadSafetyTest", () => {
  it.skip("#active? is synchronized", () => {});
  it.skip("#verify! is synchronized", () => {});
});

describe("AdvisoryLocksEnabledTest", () => {
  it.skip("advisory locks enabled?", () => {});
});

describe("InvalidateTransactionTest", () => {
  it.skip("invalidates transaction on rollback error", () => {});
});
