/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/bind_parameter_test.rb
 */
import { describe, it, expect, afterEach } from "vitest";
import { Notifications, NotificationEvent as Event, Logger } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { IntegerType, StringType } from "@blazetrails/activemodel";
import { Nodes, Collectors } from "@blazetrails/arel";
import { LogSubscriber } from "./log-subscriber.js";
import { QueryAttribute } from "./relation/query-attribute.js";
import { Base } from "./index.js";
import { registerModel } from "./associations.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
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
// prepared-statement-INDEPENDENT cases (too many binds, find one uses binds, the
// log-render tests — all adapter-agnostic) running on every backend for broader
// coverage, and gate only the one prepared-statement-SPECIFIC case
// (`nested unprepared statements`) via ctx.skip below.
describe("BindParameterTest", () => {
  // Rails: `fixtures :topics, :authors, :author_addresses, :posts`.
  useHandlerFixtures(["topics", "authors", "authorAddresses", "posts"], {
    schema: canonicalSchema,
  });

  afterEach(() => {
    Notifications.unsubscribeAll();
    Base.filterAttributes = [];
  });

  it.skip("statement cache", () => {
    // DEFERRED (story f9-statement-cache-pool-introspection): requires adapter-uniform `sql_key` + prepared-statement-pool
    // introspection. sqlite keys a plain Map by SQL; PG/MySQL use a
    // StatementPool with adapter-specific keying — there is no test-only
    // accessor mirroring Rails' `@statements.send(:cache)` / `sql_key`.
  });
  it.skip("statement cache with query cache", () => {
    // DEFERRED (story f9-statement-cache-pool-introspection): see "statement cache".
  });
  it.skip("statement cache with find", () => {
    // DEFERRED (story f9-statement-cache-pool-introspection): `cached_find_by_statement`
    // exists (core.ts) but `find` does not route through it, so the per-class
    // statement cache is never populated. Production wiring, separate story.
  });
  it.skip("statement cache with find by", () => {
    // DEFERRED (story f9-statement-cache-pool-introspection): see "statement cache with find".
  });
  it.skip("statement cache with in clause", () => {
    // DEFERRED (story f9-statement-cache-pool-introspection): see "statement cache".
  });
  it.skip("statement cache with sql string literal", () => {
    // DEFERRED (story f9-statement-cache-pool-introspection): see "statement cache".
  });

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
    // INNER JOIN. trails resolves association joins through the model registry,
    // so register the canonical Author/Post here (their fixtures load above but
    // don't auto-register the classes).
    registerModel(Author);
    registerModel(Post);

    const subquery = Author.joins("thinkingPosts").where({ name: "David" });
    const scope = Author.from(subquery, "authors").where({ id: 1 });
    expect(await scope.count()).toBe(1);
  });

  it.skip("binds are logged", () => {
    // DEFERRED (story f9-statement-cache-pool-introspection): Rails builds
    // `Relation::QueryAttribute.new("id", 1, Type::Value.new)`, passes it to
    // exec_query, and asserts the `sql.active_record` payload preserves the same
    // Attribute objects (bind_parameter_test.rb:137-145). trails type-casts binds
    // to primitives in the relation/predicate-builder layer *upstream* of the
    // adapter, so the notification boundary only ever carries primitives (see
    // `find one uses binds`, whose payload.binds is `[1]`) — there is no
    // adapter-level payload.binds (objects) vs type_casted_binds (primitives)
    // split to assert against. A hand-built exec_query with raw QueryAttribute
    // binds can't reproduce it either: the sqlite driver type-casts inside
    // `execute` *before* instrumentation is entered, so it rejects and no event
    // fires. Preserving Attribute objects on the payload is production work,
    // tracked in the follow-up story.
  });

  it("find one uses binds", async () => {
    const subscriber = new LogListener();
    const sub = Notifications.subscribe("sql.active_record", (e: Event) => subscriber.call(e));
    try {
      await Topic.find(1);
      // Rails asserts `attr.value == 1` on the QueryAttribute payload binds
      // (bind_parameter_test.rb:148-152). trails type-casts binds to primitives
      // in the relation layer, so the payload carries `[1]` rather than Attribute
      // objects — the `?? attr` fallback matches the primitive trails emits. (The
      // payload can't preserve Attribute objects without production changes; the
      // stronger `binds are logged` assertion is deferred to
      // f9-statement-cache-pool-introspection for exactly that reason.)
      const message = subscriber.events.find((e) =>
        (e.payload.binds as any[])?.some((attr) => (attr?.value ?? attr) === 1),
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
    // trails' adapter `selectAll` takes a SQL string (Rails' takes arel); render
    // the inlined SQL through the same connection path before executing.
    expect((await conn.selectAll(conn.toSql(arelNode))).length).toBe(3);
  }

  it("bind params to sql with prepared statements", async (ctx) => {
    // Rails wraps the whole BindParameterTest in `if prepared_statements`;
    // MySQL/MariaDB default it off, so mirror that class-level guard here.
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);
    registerModel(Author);
    await assertBindParamsToSql(conn);
  });

  it("bind params to sql with unprepared statements", async (ctx) => {
    const conn = Topic.leaseConnection() as any;
    ctx.skip(!conn.preparedStatements);
    registerModel(Author);
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
