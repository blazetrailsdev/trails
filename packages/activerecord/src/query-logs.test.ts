import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ExecutionContext } from "@blazetrails/activesupport";
import "./index.js";
import { Base } from "./base.js";
import { QueryLogs, escapeComment, GetKeyHandler } from "./query-logs.js";
import { LegacyFormatter, SQLCommenter } from "./query-logs-formatter.js";
import { queryLogs } from "./query-logs-instance.js";
import { queryTransformers, type QueryTransformer } from "./query-transformers.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";
import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "./test-helpers/test-schema.js";
import { Dashboard } from "./test-helpers/models/dashboard.js";
import { adapterType } from "./test-adapter.js";

// Rails drives these tests through `ActiveRecord::Base.lease_connection.execute`.
type RawAdapter = { execute(sql: string, binds?: unknown[], name?: string): Promise<unknown> };
function leaseConnection(): RawAdapter {
  return Base.connection as unknown as RawAdapter;
}

// Mirrors: activerecord/test/cases/query_logs_test.rb
//
// These tests drive real queries through the full pipeline — the
// `queryTransformers` loop wired into `preprocessQuery` (QL PR 3) appends the
// QueryLogs comment, and the `sql.active_record` notification carries the
// post-transform SQL — and assert the tagged SQL via `assertQueriesMatch`
// (Rails' `assert_queries_match` / `SQLCounter`), exactly as the Rails
// counterpart does (`Dashboard.first`, `connection.execute "SELECT 1"`).
describe("QueryLogsTest", () => {
  // Rails: `fixtures :dashboards`. `useHandlerFixtures` wires the handler suite
  // internally. `schema: canonicalSchema` defends against sibling-file schema
  // contamination in the shared worker DB.
  useHandlerFixtures(["dashboards"], { schema: canonicalSchema });

  let originalTransformers: QueryTransformer[];

  // Mirrors the Rails setup/teardown: register QueryLogs into
  // `ActiveRecord.query_transformers`, reset its config, and seed the default
  // `application: -> { "active_record" }` tagging. trails resolves string tags
  // (`:application`) from the QueryLogs context, so the default tagging is the
  // `updateContext({ application: "active_record" })` below (Rails stores it in
  // `taggings`). Restored in afterEach so nothing leaks to sibling files
  // sharing the process-global registry / singleton.
  beforeEach(() => {
    ExecutionContext.clear();
    originalTransformers = [...queryTransformers];
    queryTransformers.length = 0;
    queryTransformers.push(queryLogs);
    queryLogs.prependComment = false;
    queryLogs.cacheQueryLogTags = false;
    queryLogs.clearCache();
    queryLogs.clearContext();
    queryLogs.tags = [];
    queryLogs.formatter = "legacy";
    queryLogs.updateContext({ application: "active_record" });
  });

  afterEach(() => {
    queryTransformers.length = 0;
    queryTransformers.push(...originalTransformers);
    queryLogs.prependComment = false;
    queryLogs.cacheQueryLogTags = false;
    queryLogs.tags = [];
    queryLogs.clearContext();
    queryLogs.clearCache();
    queryLogs.formatter = "legacy";
    ExecutionContext.clear();
  });

  // Unit tests — Rails' `escape_sql_comment` is exercised directly, no fixtures.
  it("escaping good comment", () => {
    expect(escapeComment("app:MyApp")).toBe("app:MyApp");
  });

  it("escaping good comment with custom separator", () => {
    expect(escapeComment("app=MyApp")).toBe("app=MyApp");
  });

  it("escaping bad comments", () => {
    expect(escapeComment("*/")).toBe("* /");
    expect(escapeComment("/*")).toBe("/ *");
    expect(escapeComment("/* evil */")).toBe("/ * evil * /");
  });

  // Rails executes `select id from posts`; trails drives the equivalent raw
  // SELECT against the seeded `dashboards` fixture table to avoid the shared
  // `posts`-table contention documented across the AR handler suite.
  it("basic commenting", async () => {
    queryLogs.tags = ["application"];
    await assertQueriesMatch(
      /select dashboard_id from dashboards \/\*application:active_record\*\/$/,
      undefined,
      false,
      async () => {
        await leaseConnection().execute("select dashboard_id from dashboards");
      },
    );
  });

  it("add comments to beginning of query", async () => {
    queryLogs.tags = ["application"];
    queryLogs.prependComment = true;
    await assertQueriesMatch(
      /^\/\*application:active_record\*\/ select dashboard_id from dashboards$/,
      undefined,
      false,
      async () => {
        await leaseConnection().execute("select dashboard_id from dashboards");
      },
    );
  });

  it("exists is commented", async () => {
    queryLogs.tags = ["application"];
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      await Dashboard.exists();
    });
  });

  it("delete is commented", async () => {
    queryLogs.tags = ["application"];
    const record = await Dashboard.first();
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      await record!.destroy();
    });
  });

  it("update is commented", async () => {
    queryLogs.tags = ["application"];
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      // Dashboard declares only its primary key, so widen to reach the
      // schema-backed `name` column for the Rails `dash.name = ...` write.
      const dash = (await Dashboard.first()) as (Dashboard & { name: string }) | null;
      dash!.name = "New name";
      await dash!.save();
    });
  });

  it("create is commented", async () => {
    queryLogs.tags = ["application"];
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      await Dashboard.create({ name: "Another dashboard" });
    });
  });

  it("select is commented", async () => {
    queryLogs.tags = ["application"];
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      await Dashboard.all().toArray();
    });
  });

  it("retrieves comment from cache when enabled and set", async () => {
    queryLogs.cacheQueryLogTags = true;
    let i = 0;
    queryLogs.tags = [{ query_counter: () => ++i }];

    // The proc increments on each comment build; caching means it runs once, so
    // both queries carry `query_counter:1`.
    await assertQueriesMatch(/SELECT 1 \/\*query_counter:1\*\//, undefined, false, async () => {
      await leaseConnection().execute("SELECT 1");
    });
    await assertQueriesMatch(/SELECT 1 \/\*query_counter:1\*\//, undefined, false, async () => {
      await leaseConnection().execute("SELECT 1");
    });
  });

  it("resets cache on context update", async () => {
    queryLogs.cacheQueryLogTags = true;
    queryLogs.updateContext({ temporary: "value" });
    queryLogs.tags = [
      { temporary_tag: (ctx) => (ctx as Record<string, unknown>).temporary as string },
    ];

    await assertQueriesMatch(/SELECT 1 \/\*temporary_tag:value\*\//, undefined, false, async () => {
      await leaseConnection().execute("SELECT 1");
    });

    queryLogs.updateContext({ temporary: "new_value" });

    await assertQueriesMatch(
      /SELECT 1 \/\*temporary_tag:new_value\*\//,
      undefined,
      false,
      async () => {
        await leaseConnection().execute("SELECT 1");
      },
    );
  });

  it("default tag behavior", async () => {
    queryLogs.tags = ["application", "foo"];
    queryLogs.updateContext({ foo: "bar" });
    await assertQueriesMatch(
      /\/\*application:active_record,foo:bar\*\//,
      undefined,
      false,
      async () => {
        await Dashboard.first();
      },
    );

    queryLogs.clearContext();
    queryLogs.updateContext({ application: "active_record" });
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      await Dashboard.first();
    });
  });

  it("connection is passed to tagging proc", async () => {
    const connection = leaseConnection();
    queryLogs.tags = [
      {
        same_connection: (ctx) =>
          (ctx as Record<string, unknown>).connection === connection ? "true" : "false",
      },
    ];
    await assertQueriesMatch(
      /SELECT 1 \/\*same_connection:true\*\//,
      undefined,
      false,
      async () => {
        await connection.execute("SELECT 1");
      },
    );
  });

  it("connection does not override already existing connection in context", async () => {
    const fakeConnection = {};
    // Rails sets `ExecutionContext[:connection]`; trails resolves tag context
    // from the QueryLogs context, so the fake is seeded via updateContext. The
    // live adapter passed by the transformer loop must not clobber it.
    queryLogs.updateContext({ connection: fakeConnection } as never);
    queryLogs.tags = [
      {
        fake_connection: (ctx) =>
          (ctx as Record<string, unknown>).connection === fakeConnection ? "true" : "false",
      },
    ];
    await assertQueriesMatch(
      /SELECT 1 \/\*fake_connection:true\*\//,
      undefined,
      false,
      async () => {
        await leaseConnection().execute("SELECT 1");
      },
    );
  });

  it("empty comments are not added", async () => {
    queryLogs.tags = [{ empty: () => null }];
    await assertQueriesMatch(/SELECT 1$/, undefined, false, async () => {
      await leaseConnection().execute("SELECT 1");
    });
  });

  it("sql commenter format", async () => {
    queryLogs.formatter = "sqlcommenter";
    queryLogs.tags = ["application"];
    await assertQueriesMatch(/\/\*application='active_record'\*\//, undefined, false, async () => {
      await Dashboard.first();
    });
  });

  it("custom basic tags", async () => {
    queryLogs.tags = ["application", { custom_string: "test content" }];
    await assertQueriesMatch(
      /\/\*application:active_record,custom_string:test content\*\//,
      undefined,
      false,
      async () => {
        await Dashboard.first();
      },
    );
  });

  it("custom proc tags", async () => {
    queryLogs.tags = ["application", { custom_proc: () => "test content" }];
    await assertQueriesMatch(
      /\/\*application:active_record,custom_proc:test content\*\//,
      undefined,
      false,
      async () => {
        await Dashboard.first();
      },
    );
  });

  it("multiple custom tags", async () => {
    queryLogs.tags = [
      "application",
      { custom_proc: () => "test content", another_proc: () => "more test content" },
    ];
    await assertQueriesMatch(
      /\/\*another_proc:more test content,application:active_record,custom_proc:test content\*\//,
      undefined,
      false,
      async () => {
        await Dashboard.first();
      },
    );
  });

  it("sqlcommenter format value", async () => {
    queryLogs.formatter = "sqlcommenter";
    queryLogs.tags = [
      "application",
      { tracestate: "congo=t61rcWkgMzE,rojo=00f067aa0ba902b7", custom_proc: () => "Joe's Shack" },
    ];
    await assertQueriesMatch(
      /custom_proc='Joe%27s%20Shack',tracestate='congo%3Dt61rcWkgMzE%2Crojo%3D00f067aa0ba902b7'\*\//,
      undefined,
      false,
      async () => {
        await Dashboard.first();
      },
    );
  });

  it("sqlcommenter format allows string keys", async () => {
    queryLogs.formatter = "sqlcommenter";
    queryLogs.tags = [
      "application",
      {
        string: "value",
        tracestate: "congo=t61rcWkgMzE,rojo=00f067aa0ba902b7",
        custom_proc: () => "Joe's Shack",
      },
    ];
    await assertQueriesMatch(
      /custom_proc='Joe%27s%20Shack',string='value',tracestate='congo%3Dt61rcWkgMzE%2Crojo%3D00f067aa0ba902b7'\*\//,
      undefined,
      false,
      async () => {
        await Dashboard.first();
      },
    );
  });

  it("sqlcommenter format value string coercible", async () => {
    queryLogs.formatter = "sqlcommenter";
    queryLogs.tags = ["application", { custom_proc: () => 1234 }];
    await assertQueriesMatch(/custom_proc='1234'\*\//, undefined, false, async () => {
      await Dashboard.first();
    });
  });

  // PostgreSQL validates query encoding; other adapters don't. Mirrors Rails'
  // `unless current_adapter?(:PostgreSQLAdapter)` guard.
  it.skipIf(adapterType === "postgres")("invalid encoding query", async () => {
    queryLogs.tags = ["application"];
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      await leaseConnection().execute("select 1 as 'ÿ'");
    });
  });

  it("custom proc context tags", async () => {
    queryLogs.updateContext({ foo: "bar" });
    queryLogs.tags = [
      "application",
      { custom_context_proc: (ctx) => (ctx as Record<string, unknown>).foo as string },
    ];
    await assertQueriesMatch(
      /\/\*application:active_record,custom_context_proc:bar\*\//,
      undefined,
      false,
      async () => {
        await Dashboard.first();
      },
    );
  });
});

describe("GetKeyHandler", () => {
  it("looks up a named key in the context hash", () => {
    const handler = new GetKeyHandler("controller");
    expect(handler.call({ controller: "UsersController" })).toBe("UsersController");
  });

  it("returns undefined when the key is absent", () => {
    expect(new GetKeyHandler("missing").call({})).toBeUndefined();
  });

  it("is used by QueryLogs string-tag resolution", () => {
    const logs = new QueryLogs();
    logs.tags = ["controller"];
    logs.updateContext({ controller: "UsersController" });
    expect(logs.tagContent()).toBe("controller:UsersController");
  });

  it("lazy-creates a handler if a tag is pushed without going through tags=", () => {
    // tagContent must survive callers that mutate the live tags
    // array directly — the handler cache is populated lazily on
    // first access so we can't crash on a missing map entry.
    // Output is alphabetical by key (action < controller), matching Rails'
    // sorted rebuild_handlers.
    const logs = new QueryLogs();
    logs.tags = ["controller"];
    logs.tags.push("action");
    logs.updateContext({ controller: "Users", action: "index" });
    expect(logs.tagContent()).toBe("action:index,controller:Users");
  });
});

describe("LegacyFormatter", () => {
  it("formats as 'key:value'", () => {
    expect(LegacyFormatter.format("app", "MyApp")).toBe("app:MyApp");
  });

  it("joins with ','", () => {
    expect(LegacyFormatter.join(["a:1", "b:2"])).toBe("a:1,b:2");
  });
});

describe("QueryLogs.formatter =", () => {
  it("accepts a static-method class (LegacyFormatter / SQLCommenter) directly", () => {
    const logs = new QueryLogs();
    // Class value — typeof === "function". Must not throw.
    expect(() => (logs.formatter = SQLCommenter)).not.toThrow();
    expect(() => (logs.formatter = LegacyFormatter)).not.toThrow();
  });

  it("still accepts instance-shaped formatters", () => {
    const logs = new QueryLogs();
    const custom = {
      format: (k: string, v: unknown) => `${k}=${v}`,
      join: (pairs: string[]) => pairs.join(";"),
    };
    expect(() => (logs.formatter = custom)).not.toThrow();
  });

  it("rejects values missing format/join methods", () => {
    const logs = new QueryLogs();
    expect(() => (logs.formatter = { foo: 1 } as any)).toThrow(/unsupported/i);
  });
});

describe("QueryLogs.tagsFormatter", () => {
  it("defaults to legacy", () => {
    expect(new QueryLogs().tagsFormatter).toBe("legacy");
  });

  it("tracks formatter = 'sqlcommenter'", () => {
    const logs = new QueryLogs();
    logs.formatter = "sqlcommenter";
    expect(logs.tagsFormatter).toBe("sqlcommenter");
  });

  it("tracks formatter = 'legacy'", () => {
    const logs = new QueryLogs();
    logs.formatter = "sqlcommenter";
    logs.formatter = "legacy";
    expect(logs.tagsFormatter).toBe("legacy");
  });

  it("tracks formatter = SQLCommenter (class value)", () => {
    const logs = new QueryLogs();
    logs.formatter = SQLCommenter;
    expect(logs.tagsFormatter).toBe("sqlcommenter");
  });

  it("tracks formatter = LegacyFormatter (class value)", () => {
    const logs = new QueryLogs();
    logs.formatter = SQLCommenter;
    logs.formatter = LegacyFormatter;
    expect(logs.tagsFormatter).toBe("legacy");
  });

  it("falls back to 'legacy' for unknown custom formatters", () => {
    const logs = new QueryLogs();
    logs.formatter = SQLCommenter;
    logs.formatter = {
      format: (k: string, v: unknown) => `${k}=${v}`,
      join: (pairs: string[]) => pairs.join(";"),
    };
    expect(logs.tagsFormatter).toBe("legacy");
  });
});

describe("SQLCommenter", () => {
  it("formats as OpenTelemetry key='value' with URL-encoding", () => {
    expect(SQLCommenter.format("app", "My App")).toBe("app='My%20App'");
  });

  it("encodes single quotes as %27", () => {
    expect(SQLCommenter.format("k", "v'x")).toBe("k='v%27x'");
  });

  it("joins with ','", () => {
    expect(SQLCommenter.join(["a='1'", "b='2'"])).toBe("a='1',b='2'");
  });
});
