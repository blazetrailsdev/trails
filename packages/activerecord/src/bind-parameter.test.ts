/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/bind_parameter_test.rb
 */
import { describe, it, expect, afterEach } from "vitest";
import { Notifications, NotificationEvent as Event, Logger } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { IntegerType, StringType } from "@blazetrails/activemodel";
import { LogSubscriber } from "./log-subscriber.js";
import { QueryAttribute } from "./relation/query-attribute.js";
import { Base } from "./index.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Topic } from "./test-helpers/models/topic.js";

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
  const event = new Event("sql.active_record", Temporal.Now.instant(), {
    name: "SQL",
    sql,
    binds,
    type_casted_binds: binds.map((b) => (b instanceof QueryAttribute ? b.valueForDatabase : b)),
  });
  subscriber.sql(event);
  return subscriber.capture.debugs[0] ?? "";
}

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

  it.skip("bind from join in subquery", () => {
    // DEFERRED (story f9-bind-params-to-sql-and-join-subquery): needs association-name joins (`joins(:thinking_posts)`) plus
    // bind threading through `from(subquery)`. trails' `joins(table, on)` is the
    // manual SQL-fragment form only — a bare association name renders as a raw
    // table alias (`FROM authors thinkingPosts`), never an INNER JOIN. Wiring
    // association joins is production work, tracked in the follow-up story.
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
    expect(logBinds(binds)).toMatch(/\["id",10\]\]/);
  });

  it("logs unnamed binds", () => {
    const binds = ["abcd"];
    expect(logBinds(binds, "select * from topics where title = $1")).toMatch(/\[null,"abcd"\]\]/);
  });

  it("binds with filtered attributes", () => {
    Base.filterAttributes = ["auth"];
    const binds = [new QueryAttribute("auth_token", "abcd", new StringType())];
    expect(logBinds(binds, "select * from users where auth_token = ?")).toContain(
      '["auth_token","[FILTERED]"]',
    );
  });

  it.skip("bind params to sql with prepared statements", () => {
    // DEFERRED (story f9-bind-params-to-sql-and-join-subquery): Rails builds the expected SQL with `@connection.send(:collector)`
    // + `visitor.compile(bind_params, collector)` to render adapter-correct
    // placeholders ($1/?/literal) with shared bind numbering. trails' `compile`
    // takes a single node with no shared collector state, so the multi-bind
    // numbering can't be reproduced test-only — tracked in the follow-up story.
  });
  it.skip("bind params to sql with unprepared statements", () => {
    // DEFERRED (story f9-bind-params-to-sql-and-join-subquery): see
    // "bind params to sql with prepared statements".
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
