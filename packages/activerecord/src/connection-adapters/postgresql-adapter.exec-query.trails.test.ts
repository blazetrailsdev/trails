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
  const fakeClient = { query: queryImpl, release: () => {} };
  (adapter as unknown as { _rawConnection: unknown })._rawConnection = fakeClient;
  adapter.verifiedBang();
  vi.spyOn(
    adapter as unknown as { _acquireFreshClient: () => unknown },
    "_acquireFreshClient",
  ).mockResolvedValue(fakeClient);
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
        { name: "id", dataTypeID: 23 },
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
    expect((result.columnTypes as Record<number, unknown>)[0]).toBeInstanceOf(Uuid);
    expect((result.columnTypes as Record<number, unknown>)[1]).toBeInstanceOf(Uuid);
  });

  it("returns a Result with empty fields when the driver reports none", async () => {
    adapter = makeAdapter(async () => ({ rows: [], fields: [] }));
    const result = await adapter.execQuery("CREATE TABLE x (id int)");
    expect(result).toBeInstanceOf(Result);
    expect(result.length).toBe(0);
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
    expect(pool.isKey("schema_a, public-SELECT * FROM widgets")).toBe(true);
    expect(pool.isKey("schema_b, public-SELECT * FROM widgets")).toBe(true);
    expect(pool.length).toBe(2);

    setMemo("schema_a, public");
    expect(await preparedNameFor(fakeClient, "SELECT * FROM widgets")).toBe(nameA);
    expect(pool.length).toBe(2);
  });

  it("setSchemaSearchPath re-scopes the key so no stale statement is reused", async () => {
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
    adapter.verifiedBang();
    vi.spyOn(
      adapter as unknown as { openTransactions: () => number },
      "openTransactions",
    ).mockReturnValue(1);

    const result = await adapter.executeMutation(
      "INSERT INTO posts (title) VALUES ('test')",
      [],
      "SQL",
    );
    expect(typeof result).toBe("number");
    expect(queries.some((q) => q.startsWith("SAVEPOINT "))).toBe(true);
    expect(queries.some((q) => q.startsWith("RELEASE SAVEPOINT "))).toBe(true);

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
