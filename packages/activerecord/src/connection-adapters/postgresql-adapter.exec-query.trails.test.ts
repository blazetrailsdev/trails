/**
 * PostgreSQLAdapter#execQuery + #lookupCastTypeFromColumn.
 *
 * Uses a mocked pg.Client-like connection so the tests don't require a
 * live PostgreSQL; they verify that each field's dataTypeID resolves
 * through the adapter's type_map, that the resulting Result has
 * columnTypes populated, and that iterating those types actually casts
 * cell values through the right OID::Type.
 */
import { ValueType } from "@blazetrails/activemodel";
import { Notifications } from "@blazetrails/activesupport";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Result } from "../result.js";
import { Store } from "./abstract/query-cache.js";
import { Uuid } from "./postgresql/oid/uuid.js";
import { PostgreSQLAdapter, type StatementPool } from "./postgresql-adapter.js";

const UUID_OID = 2950;

function makeAdapter(queryImpl: (...args: unknown[]) => Promise<unknown>): PostgreSQLAdapter {
  const adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
  // Preset the persistent connection so withRawConnection yields it directly
  // (the loop yields `_connection`); mark verified so the verify/reconnect
  // preamble is skipped, and stub the acquire as a safety net.
  const fakeClient = { query: queryImpl, release: () => {} };
  (adapter as unknown as { _rawConnection: unknown })._rawConnection = fakeClient;
  adapter.verifiedBang();
  vi.spyOn(
    adapter as unknown as { _acquireFreshClient: () => unknown },
    "_acquireFreshClient",
  ).mockResolvedValue(fakeClient);
  // In a live PG adapter, loadAdditionalTypes queries pg_type and
  // aliases numeric OIDs → typnames registered in the static map.
  // Pre-register the known base OIDs so execQuery's miss path resolves
  // them without needing a DB.
  adapter.typeMap.aliasType(UUID_OID, "uuid");
  adapter.typeMap.aliasType(23, "int4");
  return adapter;
}

describe("PostgreSQLAdapter#execQuery", () => {
  let adapter: PostgreSQLAdapter;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter) await adapter.close().catch(() => undefined);
  });

  it("returns a Result with columnTypes resolved from the type_map", async () => {
    adapter = makeAdapter(async () => ({
      rows: [[1, "A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11"]],
      fields: [
        { name: "id", dataTypeID: 23 /* int4 */ },
        { name: "guid", dataTypeID: UUID_OID },
      ],
    }));
    const result = await adapter.execQuery("SELECT id, guid FROM users");
    expect(result).toBeInstanceOf(Result);
    expect(result.columns).toEqual(["id", "guid"]);
    expect(result.columnTypes.guid).toBeInstanceOf(Uuid);
  });

  it("castValues() applies Uuid.deserialize to normalize case and braces", async () => {
    adapter = makeAdapter(async () => ({
      rows: [["{A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11}"]],
      fields: [{ name: "guid", dataTypeID: UUID_OID }],
    }));
    const result = await adapter.execQuery("SELECT guid FROM users");
    expect(result.castValues()).toEqual(["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"]);
  });

  it("preserves duplicate column names via positional rows", async () => {
    // Query with duplicate column names (e.g. SELECT guid, guid FROM users)
    // would collide under hash-keyed rows. rowMode: "array" keeps both.
    adapter = makeAdapter(async () => ({
      rows: [["a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"]],
      fields: [
        { name: "guid", dataTypeID: UUID_OID },
        { name: "guid", dataTypeID: UUID_OID },
      ],
    }));
    const result = await adapter.execQuery("SELECT guid, guid FROM users");
    expect(result.rows[0]).toHaveLength(2);
    expect(result.rows[0][0]).toBe("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    expect(result.rows[0][1]).toBe("b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22");
    // columnTypes keyed by numeric index so positional lookup still works.
    expect((result.columnTypes as Record<number, unknown>)[0]).toBeInstanceOf(Uuid);
    expect((result.columnTypes as Record<number, unknown>)[1]).toBeInstanceOf(Uuid);
  });

  it("returns a Result with empty fields when the driver reports none", async () => {
    adapter = makeAdapter(async () => ({ rows: [], fields: [] }));
    const result = await adapter.execQuery("CREATE TABLE x (id int)");
    expect(result).toBeInstanceOf(Result);
    expect(result.length).toBe(0);
    // Balances require-table-teardown; the mock driver makes this a no-op.
    // eslint-disable-next-line blazetrails/require-table-teardown
    await adapter.execQuery("DROP TABLE IF EXISTS x");
  });

  it("selectAll delegates through execQuery so the PG override wins", async () => {
    adapter = makeAdapter(async () => ({
      rows: [["A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11"]],
      fields: [{ name: "guid", dataTypeID: UUID_OID }],
    }));
    const result = await adapter.selectAll("SELECT guid FROM users");
    expect(result).toBeInstanceOf(Result);
    expect(result.columnTypes.guid).toBeInstanceOf(Uuid);
  });

  it("materializes a pending lazy transaction", async () => {
    // Mirrors Rails' raw_execute (materialize_transactions defaults true): the
    // general read path materializes any pending lazy transaction so a SELECT
    // inside `transaction { }` emits BEGIN. Only SCHEMA/transaction-control
    // internal calls opt out.
    adapter = makeAdapter(async () => ({ rows: [], fields: [] }));
    const materializeSpy = vi
      .spyOn(
        adapter as unknown as { materializeTransactions: () => Promise<void> },
        "materializeTransactions",
      )
      .mockResolvedValue(undefined);
    await adapter.execQuery("SELECT 1");
    expect(materializeSpy).toHaveBeenCalled();
  });
});

describe("PostgreSQLAdapter#lookupCastTypeFromColumn", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(() => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
    // Stub loadAdditionalTypes to avoid a DB roundtrip on miss. Tests
    // that need the miss→resolve path register the OID manually.
    vi.spyOn(adapter, "loadAdditionalTypes").mockResolvedValue(undefined);
    adapter.typeMap.aliasType(UUID_OID, "uuid");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await adapter.close().catch(() => undefined);
  });

  it("resolves the OID → Type via the type_map", () => {
    const type = adapter.lookupCastTypeFromColumn({ oid: UUID_OID });
    expect(type).toBeInstanceOf(Uuid);
  });

  it("returns a ValueType when oid is missing", () => {
    const type = adapter.lookupCastTypeFromColumn({ oid: null, sqlType: "uuid" });
    expect(type).toBeInstanceOf(ValueType);
  });

  it("returns a ValueType when neither oid nor sqlType is available", () => {
    const type = adapter.lookupCastTypeFromColumn({});
    expect(type).toBeInstanceOf(ValueType);
  });
});

describe("PostgreSQLAdapter#execQuery prepare override", () => {
  let adapter: PostgreSQLAdapter;
  let capturedQueryArg: unknown;

  const INT4_OID = 23;
  const fakeResult = { fields: [{ name: "n", dataTypeID: INT4_OID }], rows: [[1]] };

  beforeEach(() => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
    adapter.typeMap.aliasType(INT4_OID, "int4");
    capturedQueryArg = undefined;
    const fakeClient = {
      query: async (arg: unknown) => {
        capturedQueryArg = arg;
        return fakeResult;
      },
      release: () => {},
    };
    (adapter as unknown as { _rawConnection: unknown })._rawConnection = fakeClient;
    adapter.verifiedBang();
    vi.spyOn(
      adapter as unknown as { _acquireFreshClient: () => unknown },
      "_acquireFreshClient",
    ).mockResolvedValue(fakeClient);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter) await adapter.close().catch(() => undefined);
  });

  it("prepare:true tags statement_name in the sql.active_record payload", async () => {
    const payloads: Record<string, unknown>[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      payloads.push(event.payload as Record<string, unknown>);
    });
    try {
      adapter.preparedStatements = true;
      await adapter.execQuery("SELECT 1", "SQL", [42], { prepare: true });
      const payload = payloads.find((p) => p["sql"] === "SELECT 1");
      expect(payload?.["statement_name"]).toBeTruthy();
      expect(typeof payload?.["statement_name"]).toBe("string");
    } finally {
      Notifications.unsubscribe(sub);
    }
  });

  it("prepare:false omits statement_name even when preparedStatements is true", async () => {
    const payloads: Record<string, unknown>[] = [];
    const sub = Notifications.subscribe("sql.active_record", (event: any) => {
      payloads.push(event.payload as Record<string, unknown>);
    });
    try {
      adapter.preparedStatements = true;
      await adapter.execQuery("SELECT 1", "SQL", [42], { prepare: false });
      const payload = payloads.find((p) => p["sql"] === "SELECT 1");
      expect(payload?.["statement_name"]).toBeUndefined();
      // non-prepared path: query arg is an object with text (not a named statement)
      expect((capturedQueryArg as any)?.name).toBeUndefined();
    } finally {
      Notifications.unsubscribe(sub);
    }
  });
});

describe("PostgreSQLAdapter#sqlKey", () => {
  let adapter: PostgreSQLAdapter;

  beforeEach(() => {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter) await adapter.close().catch(() => undefined);
  });

  const sqlKey = (sql: string): string =>
    (adapter as unknown as { sqlKey: (s: string) => string }).sqlKey(sql);
  const setMemo = (path: string | null): void => {
    (adapter as unknown as { _schemaSearchPathMemo: string | null })._schemaSearchPathMemo = path;
  };
  const poolFor = (_client: unknown): StatementPool =>
    (adapter as unknown as { _statements: StatementPool })._statements;
  const preparedNameFor = (client: unknown, sql: string): Promise<string> =>
    (
      adapter as unknown as {
        prepareStatement: (s: string, b: unknown[], c: unknown) => Promise<string>;
      }
    ).prepareStatement(sql, [], client);

  it("scopes the pool key to the current schema_search_path", () => {
    setMemo("schema_a, public");
    expect(sqlKey("SELECT * FROM widgets")).toBe("schema_a, public-SELECT * FROM widgets");
    setMemo("schema_b, public");
    expect(sqlKey("SELECT * FROM widgets")).toBe("schema_b, public-SELECT * FROM widgets");
  });

  it("keys to the empty prefix before the search path is read", () => {
    setMemo(null);
    expect(sqlKey("SELECT 1")).toBe("-SELECT 1");
  });

  it("preparing the same SQL under two different search paths yields two pool entries", async () => {
    const fakeClient = { query: async () => undefined, release: () => {} };
    const pool = poolFor(fakeClient);

    setMemo("schema_a, public");
    const nameA = await preparedNameFor(fakeClient, "SELECT * FROM widgets");
    setMemo("schema_b, public");
    const nameB = await preparedNameFor(fakeClient, "SELECT * FROM widgets");

    expect(nameA).not.toBe(nameB);
    expect(pool.keys).toContain("schema_a, public-SELECT * FROM widgets");
    expect(pool.keys).toContain("schema_b, public-SELECT * FROM widgets");
    expect(pool.length).toBe(2);

    // Re-keying under the original path reuses the original entry — no stale leak.
    setMemo("schema_a, public");
    expect(await preparedNameFor(fakeClient, "SELECT * FROM widgets")).toBe(nameA);
    expect(pool.length).toBe(2);
  });

  it("setSchemaSearchPath re-scopes the key so no stale statement is reused", async () => {
    // Drive the real setSchemaSearchPath path (which issues SET search_path and
    // updates the memo) and confirm sqlKey tracks the active path end-to-end.
    vi.spyOn(adapter, "internalExecute").mockResolvedValue(undefined as never);

    await adapter.setSchemaSearchPath("schema_a, public");
    const keyA = sqlKey("SELECT * FROM widgets");

    await adapter.setSchemaSearchPath("schema_b, public");
    const keyB = sqlKey("SELECT * FROM widgets");

    expect(keyA).toBe("schema_a, public-SELECT * FROM widgets");
    expect(keyB).toBe("schema_b, public-SELECT * FROM widgets");
    expect(keyA).not.toBe(keyB);
  });
});

describe("PostgreSQLAdapter#executeMutation", () => {
  let adapter: PostgreSQLAdapter;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter) await adapter.close().catch(() => undefined);
  });

  it("savepoint nesting does not re-enter withRawConnection (_lockQueue)", async () => {
    // executeMutation runs its RETURNING-retry savepoints via client.query()
    // on the yielded conn — it does NOT call this.createSavepoint(), which
    // would re-acquire withRawConnection. Verify the savepoint statements hit
    // the yielded connection directly and that the outer lock is released
    // cleanly (a second withRawConnection call queued immediately after must
    // succeed without hanging).
    const queries: string[] = [];
    const fakeClient = {
      query: async (arg: unknown) => {
        queries.push(typeof arg === "string" ? arg : (arg as { text: string }).text);
        return { rows: [{ id: 42 }], rowCount: 1, fields: [] };
      },
      release: () => {},
    };
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
    (adapter as unknown as { _rawConnection: unknown })._rawConnection = fakeClient;
    vi.spyOn(
      adapter as unknown as { _acquireFreshClient: () => unknown },
      "_acquireFreshClient",
    ).mockResolvedValue(fakeClient);
    // Mark verified so withRawConnection's verify/reconnect preamble is
    // skipped — reconnect() would otherwise reset _inTransaction (the mock
    // leaves _rawConnection null, which a live in-transaction adapter never
    // does). Inside a transaction the bare-INSERT RETURNING-append path wraps
    // the attempt in a SAVEPOINT so a RETURNING failure can roll back without
    // poisoning the outer transaction (postgresql-adapter.ts:1405).
    adapter.verifiedBang();
    (adapter as unknown as { _inTransaction: boolean })._inTransaction = true;

    const result = await adapter.executeMutation(
      "INSERT INTO posts (title) VALUES ('test')",
      [],
      "SQL",
    );
    expect(typeof result).toBe("number");
    // The savepoint dance ran on the yielded connection (not a nested
    // withRawConnection): SAVEPOINT … then RELEASE SAVEPOINT bracket the insert.
    expect(queries.some((q) => q.startsWith("SAVEPOINT "))).toBe(true);
    expect(queries.some((q) => q.startsWith("RELEASE SAVEPOINT "))).toBe(true);

    // A second withRawConnection call must complete immediately — if the first
    // call deadlocked on _lockQueue the second would never resolve.
    let secondCallRan = false;
    await adapter.withRawConnection({ materializeTransactions: false }, async () => {
      secondCallRan = true;
    });
    expect(secondCallRan).toBe(true);
  });
});

describe("PostgreSQLAdapter#execInsert sequence probe", () => {
  let adapter: PostgreSQLAdapter;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter) await adapter.close().catch(() => undefined);
  });

  // Rails' exec_insert runs the INSERT and `last_insert_id_result`'s
  // `SELECT currval(...)` on the connection it already holds
  // (postgresql/database_statements.rb:48-59, :204-206). `currval()` is
  // session-scoped AND session-mutable, so a second INSERT landing between one
  // call's INSERT and its own probe hands back the wrong id. The fake session
  // below models exactly that: `currval` answers with whatever the session
  // inserted last.
  it("reads currval on the session that ran its own INSERT", async () => {
    let sequence = 0;
    let currval = 0;
    adapter = makeAdapter(async (sql: unknown) => {
      const text = typeof sql === "string" ? sql : String((sql as { text: string }).text);
      if (text.includes("INSERT INTO")) {
        await Promise.resolve();
        currval = ++sequence;
        return { rows: [], fields: [] };
      }
      return { rows: [[currval]], fields: [{ name: "currval", dataTypeID: 23 }] };
    });
    (adapter as unknown as { _useInsertReturning: boolean })._useInsertReturning = false;

    const insert = (title: string) =>
      adapter.execInsert(
        `INSERT INTO posts (title) VALUES ('${title}')`,
        "SQL",
        [],
        "id",
        "posts_id_seq",
      );
    const [first, second] = await Promise.all([insert("a"), insert("b")]);

    expect(first.rows[0][0]).toBe(1);
    expect(second.rows[0][0]).toBe(2);
  });
});

describe("PostgreSQLAdapter#execInsert query cache", () => {
  let adapter: PostgreSQLAdapter;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (adapter) await adapter.close().catch(() => undefined);
  });

  function adapterWithPrimedCache(useInsertReturning: boolean): Store {
    adapter = new PostgreSQLAdapter({ host: "localhost", port: 1 });
    const qc = new Store();
    qc.enabled = true;
    qc.dirties = true;
    (adapter as unknown as { _queryCache: Store })._queryCache = qc;
    (adapter as unknown as { _useInsertReturning: boolean })._useInsertReturning =
      useInsertReturning;
    return qc;
  }

  // Rails wires `dirties_query_cache` on the PUBLIC `insert`/`create`
  // (query_cache.rb:13-15), which sits above both arms of PostgreSQL's
  // `exec_insert` override (postgresql/database_statements.rb:46-59). The
  // wrapper clears before delegating; the delegated read-back has no live
  // connection and rejects, but the cache is already cleared by then.
  it("clears the query cache on a multi-column RETURNING insert", async () => {
    const qc = adapterWithPrimedCache(true);
    await qc.computeIfAbsent("SELECT * FROM posts", async () => [{ id: 1 }]);
    expect(qc.empty).toBe(false);

    await adapter
      .insert("INSERT INTO posts (title) VALUES ('t')", "SQL", "id", undefined, null, [], {
        returning: ["id", "created_at"],
      })
      .catch(() => undefined);

    expect(qc.empty).toBe(true);
  });

  // The `use_insert_returning? == false` arm calls `internal_exec_query`
  // directly (postgresql/database_statements.rb:48-59) and never reaches
  // `AbstractAdapter#exec_insert`, so wiring the clear on `exec_insert` leaves
  // this arm uncleared. Rails clears on `insert`, above both arms.
  it("clears the query cache on a non-returning insert", async () => {
    const qc = adapterWithPrimedCache(false);
    await qc.computeIfAbsent("SELECT * FROM posts", async () => [{ id: 1 }]);
    expect(qc.empty).toBe(false);

    await adapter
      .insert("INSERT INTO posts (title) VALUES ('t')", "SQL", "id", undefined, "posts_id_seq", [])
      .catch(() => undefined);

    expect(qc.empty).toBe(true);
  });
});
