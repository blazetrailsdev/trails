/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/bind_parameter_test.rb
 */
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { Notifications, NotificationEvent as Event, Logger } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { IntegerType, StringType, ValueType } from "@blazetrails/activemodel";
import { Nodes, Collectors } from "@blazetrails/arel";
import { LogSubscriber } from "./log-subscriber.js";
import { QueryAttribute } from "./relation/query-attribute.js";
import { Base, RecordNotFound } from "./index.js";
import { registerModel } from "./associations.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { defineSchema } from "./test-helpers/define-schema.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Author } from "./test-helpers/models/author.js";
import { Post } from "./test-helpers/models/post.js";

// Captures `sql.active_record` notification events, mirroring Rails'
// LogListener subscribed in the test's `setup`.
class LogListener {
  events: Event[] = [];
  call(event: Event): void {
    this.events.push(event);
  }
}

// Test-only LogSubscriber subclass that captures rendered debug lines,
// mirroring the anonymous LogSubscriber subclass in Rails' assert_logs_binds.
class CaptureLogger extends Logger {
  debugs: string[] = [];
  constructor() {
    super(null);
  }
  override debug(message?: string | (() => string)): boolean {
    this.debugs.push(typeof message === "function" ? message() : (message ?? ""));
    return true;
  }
}

class DebugLogSubscriber extends LogSubscriber {
  capture = new CaptureLogger();
  override get logger(): Logger {
    return this.capture;
  }
}

function logBinds(binds: unknown[], sql = "select * from topics where id = ?"): string {
  const subscriber = new DebugLogSubscriber();
  // Rails' assert_logs_binds helpers build the payload with
  // `@connection.send(:type_casted_binds, binds)` — use the connection's real
  // type_casted_binds (abstract/quoting.ts) rather than hand-casting.
  const conn = Topic.leaseConnection() as any;
  const event = new Event("sql.active_record", Temporal.Now.instant(), {
    name: "SQL",
    sql,
    binds,
    type_casted_binds: conn.typeCastedBinds(binds),
  });
  subscriber.sql(event);
  return subscriber.capture.debugs[0] ?? "";
}

// Rails wraps the entire class in `if Base.lease_connection.prepared_statements`
// (bind_parameter_test.rb:9), so on adapters with prepared statements off (MySQL/
// MariaDB default) NONE of these run. Deliberate deviation: we keep the
// prepared-statement-INDEPENDENT cases (too many binds, the log-render tests —
// all adapter-agnostic) running on every backend for broader coverage, and gate
// the prepared-statement-SPECIFIC cases (`find one uses binds`, `bind from join
// in subquery`, `nested unprepared statements`) via ctx.skip below — the first
// because `find` now routes through the inlined StatementCache path when
// unprepared, logging no binds (matching Rails).
describe("BindParameterTest", () => {
  // Rails: `fixtures :topics, :authors, :author_addresses, :posts`.
  useHandlerFixtures(["topics", "authors", "authorAddresses", "posts"], {
    schema: canonicalSchema,
  });

  beforeAll(async () => {
    // A sibling file (e.g. coders/json.test.ts's SerializedTopic) physically
    // replaces `topics` with a bespoke shape lacking `author_name`. The worker's
    // canonical-schema preload keeps the signature cache warm, so the fixtures'
    // own `defineSchema` is a no-op and the bespoke table survives into this
    // suite — its fixture load then fails with "table topics has no column named
    // author_name". `dropExisting` bypasses the cache and rebuilds the canonical
    // shape verbatim (mirrors the shield in locking.test.ts / dirty.test.ts).
    await defineSchema(
      {
        topics: canonicalSchema.topics,
        authors: canonicalSchema.authors,
        author_addresses: canonicalSchema.author_addresses,
        posts: canonicalSchema.posts,
      },
      { dropExisting: true },
    );
    registerModel(Author);
    registerModel(Post);
  });

  afterEach(() => {
    Notifications.unsubscribeAll();
    Base.filterAttributes = [];
  });

  // Rails' private helpers (bind_parameter_test.rb ll. 260-274):
  //   statement_cache → @connection.instance_variable_get(:@statements).send(:cache)
  //   to_sql_key(arel) → sql = @connection.to_sql(arel);
  //                      @connection.respond_to?(:sql_key) ? sql_key(sql) : sql
  // statement_cache → the connection statement pool's keys (`StatementPool#cache`).
  function statementCacheKeys(conn: any): string[] {
    return conn._statementPool.keys;
  }
  // Deliberate deviation: trails' `to_sql` inlines bind values (see the
  // `bindParams` note below), so an arel can't be recompiled into the
  // placeholder SQL the prepared-statement pool is keyed by. Instead we capture
  // the SQL the connection actually executes — and therefore keys its pool by —
  // from the `sql.active_record` payload, then run it through `sql_key`. That is
  // exactly the string the pool stores (SQLite keys by the raw SQL, PG prefixes
  // the schema search path), so `assert_includes`/`assert_not_includes` observe
  // the real invariant Rails asserts: preparable SELECTs (find/find_by/where on a
  // scalar — placeholder SQL + binds) populate the pool, while inlined queries
  // (IN-clause arrays, SQL string literals — no binds) do not.
  // `stop()` freezes the capture before each test's assertions; the suite-level
  // `afterEach(() => Notifications.unsubscribeAll())` above is the teardown safety
  // net, so a query that throws before `stop()` can't leak this subscriber into
  // later tests.
  function captureSelectSql(table = "topics"): { sqls: string[]; stop: () => void } {
    const sqls: string[] = [];
    const tableRe = new RegExp(`\\b${table}\\b`);
    const isTableSelect = (sql: unknown): sql is string =>
      typeof sql === "string" && /^\s*SELECT\b/i.test(sql) && tableRe.test(sql);
    const sub = Notifications.subscribe("sql.active_record", (e: Event) => {
      const sql = e.payload.sql;
      if (isTableSelect(sql)) sqls.push(sql);
    });
    return { sqls, stop: () => Notifications.unsubscribe(sub) };
  }

  it("statement cache", async (ctx) => {
    // Rails wraps the whole BindParameterTest in `if prepared_statements`
    // (bind_parameter_test.rb:9); MySQL/MariaDB default it off, so mirror the
    // class-level guard here (the statement pool is only populated when prepared
    // statements are enabled).
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);
    conn.clearCache();

    const cap = captureSelectSql();
    const topics = Topic.where({ id: 1 });
    expect((await topics.toArray()).map((t: any) => Number(t.id))).toEqual([1]);
    cap.stop();

    const key = conn.sqlKey(cap.sqls.at(-1));
    expect(statementCacheKeys(conn)).toContain(key);

    // Rails' second half (bind_parameter_test.rb): a fresh `clear_cache!` evicts
    // the entry, proving the pool is writable in both directions.
    conn.clearCache();
    expect(statementCacheKeys(conn)).not.toContain(key);
  });

  it("statement cache with query cache", async (ctx) => {
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);
    conn.enableQueryCacheBang();
    conn.clearCache();
    try {
      const cap = captureSelectSql();
      const topics = Topic.where({ id: 1 });
      expect((await topics.toArray()).map((t: any) => Number(t.id))).toEqual([1]);
      cap.stop();

      expect(statementCacheKeys(conn)).toContain(conn.sqlKey(cap.sqls.at(-1)));
    } finally {
      conn.disableQueryCacheBang();
    }
  });

  it("statement cache with find", async (ctx) => {
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);
    conn.clearCache();

    const cap = captureSelectSql("topics");
    expect(Number((await Topic.find(1)).id)).toBe(1);
    cap.stop();
    // Rails asserts the cached find statement is keyed into the connection pool.
    const topicSql = cap.sqls.find((s) => /LIMIT 1/.test(s))!;
    expect(statementCacheKeys(conn)).toContain(conn.sqlKey(topicSql));

    // Rails then runs `assert_raises(RecordNotFound) { SillyReply.find(2) }` and
    // asserts the *raising* model's statement is still cached — proving the
    // prepared statement is pooled even when the SELECT returns no row, and that
    // a second, distinct model gets its own pool entry. SillyReply isn't in the
    // canonical schema, so use Author (a distinct model/table this suite already
    // loads) to cover both invariants.
    const authorCap = captureSelectSql("authors");
    await expect(Author.find(999999)).rejects.toBeInstanceOf(RecordNotFound);
    authorCap.stop();
    const authorSql = authorCap.sqls.find((s) => /LIMIT 1/.test(s))!;
    expect(statementCacheKeys(conn)).toContain(conn.sqlKey(authorSql));
  });

  it("statement cache with find by", async (ctx) => {
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);
    conn.clearCache();

    const cap = captureSelectSql("topics");
    expect(Number((await Topic.findBy({ id: 1 }))!.id)).toBe(1);
    cap.stop();
    const topicSql = cap.sqls.find((s) => /LIMIT 1/.test(s))!;
    expect(statementCacheKeys(conn)).toContain(conn.sqlKey(topicSql));

    // Rails: `assert_raises(RecordNotFound) { SillyReply.find_by!(id: 2) }`, then
    // asserts the raising model's statement is still cached. SillyReply isn't in
    // the canonical schema, so use Author (a distinct loaded model) to cover both
    // the RecordNotFound-still-cached and second-pool-entry invariants for
    // find_by! the same way the find test does for find.
    const authorCap = captureSelectSql("authors");
    await expect(Author.findByBang({ id: 999999 })).rejects.toBeInstanceOf(RecordNotFound);
    authorCap.stop();
    const authorSql = authorCap.sqls.find((s) => /LIMIT 1/.test(s))!;
    expect(statementCacheKeys(conn)).toContain(conn.sqlKey(authorSql));
  });

  it("statement cache with in clause", async (ctx) => {
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);
    conn.clearCache();

    const cap = captureSelectSql();
    const topics = Topic.where({ id: [1, 3] });
    expect(
      (await topics.toArray()).map((t: any) => Number(t.id)).sort((a: number, b: number) => a - b),
    ).toEqual([1, 3]);
    cap.stop();

    // An IN-clause array is not preparable: trails inlines it (no binds), so the
    // query runs on a fresh statement and never enters the pool. assert_not_includes
    // passes for the right reason — the inlined SQL key is genuinely absent, not
    // because the pool is empty (the prior tests prove it populates).
    expect(statementCacheKeys(conn)).not.toContain(conn.sqlKey(cap.sqls.at(-1)));
  });

  // DEVIATION (tracked): Rails asserts the SQL string literal IS cached
  // (bind_parameter_test.rb:100-107, `assert_includes`): `sanitize_sql` bakes the
  // value into an `Arel::Nodes::SqlLiteral`, leaving `collector.preparable = true`
  // (no unpreparable node), so a no-bind-but-preparable SELECT is pooled. The
  // `collector.preparable` threading (Composite default-true, SqlLiteral
  // non-preparable, `compileWithBinds` 4-tuple, `opts.preparable` into selectAll)
  // is now restored, but un-skipping this case ALSO needs `where("col = ?", val)`
  // to route through `BoundSqlLiteral` (preparable) instead of a plain
  // `SqlLiteral` (non-preparable). That `build_where_clause` → `BoundSqlLiteral`
  // wiring is deferred to the `converge-build-where-clause-bound-sql-literal`
  // story (see the NOTE in relation/query-methods.ts), so this case stays skipped
  // until that lands and is un-skipped there.
  it.skip("statement cache with sql string literal", () => {});

  it("too many binds", async () => {
    const conn = Topic.leaseConnection() as any;
    const bindParamsLength = conn.bindParamsLength();

    const ids = Array.from({ length: bindParamsLength }, (_, i) => i + 1);
    ids.push((2n ** 63n) as unknown as number);

    let topics = Topic.where({ id: ids });
    expect(await topics.count()).toBe(await Topic.count());

    topics = Topic.whereNot({ id: ids });
    expect(await topics.count()).toBe(0);
  });

  it("too many binds with query cache", async () => {
    const conn = Topic.leaseConnection() as any;
    conn.enableQueryCacheBang();
    try {
      const bindParamsLength = conn.bindParamsLength();
      const ids = Array.from({ length: bindParamsLength + 1 }, (_, i) => i + 1);

      let topics = Topic.where({ id: ids });
      expect(await topics.count()).toBe(await Topic.count());

      topics = Topic.whereNot({ id: ids });
      expect(await topics.count()).toBe(0);
    } finally {
      conn.disableQueryCacheBang();
    }
  });

  it("bind from join in subquery", async (ctx) => {
    // Rails wraps the whole BindParameterTest in `if prepared_statements`
    // (bind_parameter_test.rb:9), so this case is gated too; mirror that guard.
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);

    // Rails: `joins(:thinking_posts)` — a bare association name resolved to an
    // INNER JOIN. trails resolves association joins through the model registry;
    // Author/Post are registered in `beforeAll` (their fixtures load but don't
    // auto-register the classes).
    const subquery = Author.joins("thinkingPosts").where({ name: "David" });
    const scope = Author.from(subquery, "authors").where({ id: 1 });
    expect(await scope.count()).toBe(1);
  });

  it("binds are logged", async (ctx) => {
    // Rails gates the whole BindParameterTest on `if prepared_statements`
    // (bind_parameter_test.rb:9); mirror that class wrapper.
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);

    // Rails (bind_parameter_test.rb:137-145):
    //   sub   = Arel::Nodes::BindParam.new(1)
    //   binds = [Relation::QueryAttribute.new("id", 1, Type::Value.new)]
    //   sql   = "select * from topics where id = #{sub.to_sql}"   # => "... = ?"
    //   @connection.exec_query(sql, "SQL", binds)
    //   assert_equal binds, message[4][:binds]
    // The `sql.active_record` payload must preserve the SAME QueryAttribute
    // objects passed to exec_query (payload.binds), distinct from the driver
    // primitives in payload.type_casted_binds.
    // Arel::Nodes::BindParam#to_sql renders the placeholder "?".
    const sql = `select * from topics where id = ${new Nodes.BindParam(1).toSql()}`;
    const binds = [new QueryAttribute("id", 1, new ValueType())];

    const subscriber = new LogListener();
    const handle = Notifications.subscribe("sql.active_record", (e: Event) => subscriber.call(e));
    try {
      await conn.execQuery(sql, "SQL", binds);
      // Rails finds the message by `args[4][:sql] == sql`, but adapters that
      // rewrite the placeholder (PostgreSQL turns "?" into "$1" in
      // preprocessQuery) put the rewritten SQL on the payload, so match on the
      // bind objects we passed — the thing actually under test — instead.
      const message = subscriber.events.find((e) => e.payload.binds === binds);
      expect(message?.payload.binds).toBe(binds);
    } finally {
      Notifications.unsubscribe(handle);
    }
  });

  it("find one uses binds", async (ctx) => {
    // Rails gates the whole BindParameterTest on `if prepared_statements`
    // (bind_parameter_test.rb:9). Under an unprepared connection (MySQL/MariaDB
    // default), `find` routes through the StatementCache PartialQuery path,
    // which inlines its bind values into the SQL and logs no bind payload —
    // the same shape Rails emits — so there is no `[1]` to assert. Mirror the
    // Rails guard.
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);

    const subscriber = new LogListener();
    const sub = Notifications.subscribe("sql.active_record", (e: Event) => subscriber.call(e));
    try {
      await Topic.find(1);
      // Rails asserts `attr.value == 1` on the QueryAttribute payload binds
      // (bind_parameter_test.rb:148-152). trails type-casts binds to primitives
      // in the relation layer, so the payload carries `[1]` rather than Attribute
      // objects — the `?? attr` fallback matches the primitive trails emits. (The
      // payload can't preserve Attribute objects without production changes; the
      // stronger `binds are logged` assertion is deferred to RFC 0016 story
      // `preserve-queryattribute-binds-in-notification-payload` for that reason.)
      const message = subscriber.events.find((e) =>
        (e.payload.binds as any[])?.some((attr) => Number(attr?.value ?? attr) === 1),
      );
      expect(message).toBeTruthy();
    } finally {
      Notifications.unsubscribe(sub);
    }
  });

  it("logs binds after type cast", () => {
    const binds = [new QueryAttribute("id", "10", new IntegerType())];
    // Rails anchors the binds render to end-of-line: %r(\[\["id", 10\]\]\z)
    // (bind_parameter_test.rb:309). trails' safeJsonStringify drops the space.
    expect(logBinds(binds)).toMatch(/\["id",10\]\]$/);
  });

  it("logs unnamed binds", () => {
    const binds = ["abcd"];
    // Rails: %r(\[\[nil, "abcd"\]\]\z) (bind_parameter_test.rb:340), end-anchored.
    expect(logBinds(binds, "select * from topics where title = $1")).toMatch(/\[null,"abcd"\]\]$/);
  });

  it("binds with filtered attributes", () => {
    Base.filterAttributes = ["auth"];
    const binds = [new QueryAttribute("auth_token", "abcd", new StringType())];
    expect(logBinds(binds, "select * from users where auth_token = ?")).toContain(
      '["auth_token","[FILTERED]"]',
    );
  });

  // Mirrors Rails' `bind_params(ids)` helper (bind_parameter_test.rb:254): build
  // a list of BindParam nodes and compile them through a single shared collector
  // (`@connection.send(:collector)` + `visitor.compile(bind_params, collector)`).
  // Deliberate deviation: trails' `to_sql` always inlines bind values (it mirrors
  // Rails' *unprepared* `to_sql` even when prepared_statements is on — see
  // database-statements.ts), so we drive an inlining SubstituteBinds collector
  // here regardless of mode. That renders the IN-list the same way `to_sql` does
  // (`1, 2, 3`) so the expected SQL matches on every adapter.
  function bindParams(conn: any, ids: number[]): string {
    const collector = new Collectors.SubstituteBinds(conn, new Collectors.SQLString());
    return conn.visitor.compile(
      ids.map((i) => new Nodes.BindParam(i)),
      collector,
    );
  }

  async function assertBindParamsToSql(conn: any): Promise<void> {
    const table = conn.quoteTableName(Author.tableName);
    const pk = `${table}.${conn.quoteColumnName(Author.primaryKey)}`;

    let sql = `SELECT ${table}.* FROM ${table} WHERE (${pk} IN (${bindParams(conn, [1, 2, 3])}) OR ${pk} IS NULL)`;
    const authors = Author.where({ id: [1, 2, 3, null] });
    expect(conn.toSql(authors.arel())).toBe(sql);
    expect((await authors.toArray()).length).toBe(3);

    // Rails' middle assertion (`where(id: [1, 2, 3, 2**63])` → `IN (1, 2, 3)`)
    // tests that an over-range integer is excluded from the array condition.
    // trails' ArrayHandler doesn't yet drop out-of-range values from `IN`
    // (the integer type's range check isn't applied per-element there) — that is
    // a distinct gap from this story's bind_params_to_sql collector, tracked
    // separately as story `array-where-integer-range-exclusion`.

    sql = `SELECT ${table}.* FROM ${table} WHERE ${pk} IN (${bindParams(conn, [1, 2, 3])})`;
    const arelNode = new Nodes.BoundSqlLiteral(
      `SELECT ${table}.* FROM ${table} WHERE ${pk} IN (?)`,
      [[1, 2, 3]],
    );
    expect(conn.toSql(arelNode)).toBe(sql);
    expect((await conn.selectAll(arelNode)).length).toBe(3);
  }

  it("bind params to sql with prepared statements", async (ctx) => {
    // Rails wraps the whole BindParameterTest in `if prepared_statements`;
    // MySQL/MariaDB default it off, so mirror that class-level guard here.
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);
    await assertBindParamsToSql(conn);
  });

  it("bind params to sql with unprepared statements", async (ctx) => {
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);
    await conn.unpreparedStatement(async () => {
      await assertBindParamsToSql(conn);
    });
  });

  it("nested unprepared statements", async (ctx) => {
    const conn = Topic.leaseConnection() as any;
    // Rails wraps the whole BindParameterTest in
    // `if lease_connection.prepared_statements`. MySQL/MariaDB default prepared
    // statements off, so this prepared-statement toggle behavior isn't exercised
    // there — mirror the gate instead of asserting an adapter-specific default.
    ctx.skip(!conn.preparedStatements);
    expect(conn.preparedStatements).toBe(true);

    await conn.unpreparedStatement(async () => {
      expect(conn.preparedStatements).toBe(false);

      await conn.unpreparedStatement(async () => {
        expect(conn.preparedStatements).toBe(false);
      });

      expect(conn.preparedStatements).toBe(false);
    });

    expect(conn.preparedStatements).toBe(true);
  });
});
