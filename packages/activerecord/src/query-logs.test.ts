import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ArgumentError, ExecutionContext } from "@blazetrails/activesupport";
import "./index.js";
import { Base } from "./base.js";
import { QueryLogs, GetKeyHandler } from "./query-logs.js";
import { LegacyFormatter, SQLCommenter } from "./query-logs-formatter.js";
import type { QueryTransformer } from "./query-transformers.js";
import { assertQueriesMatch } from "./testing/query-assertions.js";
import { fixtures } from "./test-fixtures.js";
import { Dashboard } from "./test-helpers/models/dashboard.js";
import { adapterType } from "./test-adapter.js";
import { queryTransformers } from "./active-record.js";

describe("QueryLogsTest", () => {
  fixtures(["dashboards"]);

  let originalTransformers: QueryTransformer[];

  beforeEach(() => {
    ExecutionContext.clear();
    originalTransformers = [...queryTransformers()];
    queryTransformers().length = 0;
    queryTransformers().push(QueryLogs);
    QueryLogs.prependComment = false;
    QueryLogs.cacheQueryLogTags = false;
    QueryLogs.clearCache();
    ExecutionContext.clear();
    QueryLogs.tags = [];
    QueryLogs.tagsFormatter = "legacy";
    ExecutionContext.setKey("application", "active_record");
  });

  afterEach(() => {
    queryTransformers().length = 0;
    queryTransformers().push(...originalTransformers);
    QueryLogs.prependComment = false;
    QueryLogs.cacheQueryLogTags = false;
    QueryLogs.tags = [];
    ExecutionContext.clear();
    QueryLogs.clearCache();
    QueryLogs.tagsFormatter = "legacy";
    ExecutionContext.clear();
  });

  it("escaping good comment", () => {
    expect(Reflect.apply(Reflect.get(QueryLogs, "escapeSqlComment"), QueryLogs, ["app:foo"])).toBe(
      "app:foo",
    );
  });

  it("escaping good comment with custom separator", () => {
    QueryLogs.tagsFormatter = "sqlcommenter";

    expect(
      Reflect.apply(Reflect.get(QueryLogs, "escapeSqlComment"), QueryLogs, ["app='foo'"]),
    ).toBe("app='foo'");
  });

  it("escaping bad comments", () => {
    expect(
      Reflect.apply(Reflect.get(QueryLogs, "escapeSqlComment"), QueryLogs, [
        "*/; DROP TABLE USERS;/*",
      ]),
    ).toBe("* /; DROP TABLE USERS;/ *");
    expect(
      Reflect.apply(Reflect.get(QueryLogs, "escapeSqlComment"), QueryLogs, [
        "**//; DROP TABLE USERS;/*",
      ]),
    ).toBe("** //; DROP TABLE USERS;/ *");
    expect(
      Reflect.apply(Reflect.get(QueryLogs, "escapeSqlComment"), QueryLogs, [
        "* *//; DROP TABLE USERS;//* *",
      ]),
    ).toBe("* * //; DROP TABLE USERS;// * *");
  });

  it("basic commenting", async () => {
    QueryLogs.tags = ["application"];
    await assertQueriesMatch(
      /select dashboard_id from dashboards \/\*application:active_record\*\/$/,
      undefined,
      false,
      async () => {
        await (await Base.leaseConnection()).execute("select dashboard_id from dashboards");
      },
    );
  });

  it("add comments to beginning of query", async () => {
    QueryLogs.tags = ["application"];
    QueryLogs.prependComment = true;
    await assertQueriesMatch(
      /^\/\*application:active_record\*\/ select dashboard_id from dashboards$/,
      undefined,
      false,
      async () => {
        await (await Base.leaseConnection()).execute("select dashboard_id from dashboards");
      },
    );
  });

  it("exists is commented", async () => {
    QueryLogs.tags = ["application"];
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      await Dashboard.isExists();
    });
  });

  it("delete is commented", async () => {
    QueryLogs.tags = ["application"];
    const record = await Dashboard.first();
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      await record!.destroy();
    });
  });

  it("update is commented", async () => {
    QueryLogs.tags = ["application"];
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      const dash = (await Dashboard.first()) as (Dashboard & { name: string }) | null;
      dash!.name = "New name";
      await dash!.save();
    });
  });

  it("create is commented", async () => {
    QueryLogs.tags = ["application"];
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      await Dashboard.create({ name: "Another dashboard" });
    });
  });

  it("select is commented", async () => {
    QueryLogs.tags = ["application"];
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      await Dashboard.all();
    });
  });

  it("retrieves comment from cache when enabled and set", async () => {
    QueryLogs.cacheQueryLogTags = true;
    let i = 0;
    QueryLogs.tags = [{ query_counter: () => ++i }];

    await assertQueriesMatch(/SELECT 1 \/\*query_counter:1\*\//, undefined, false, async () => {
      await (await Base.leaseConnection()).execute("SELECT 1");
    });
    await assertQueriesMatch(/SELECT 1 \/\*query_counter:1\*\//, undefined, false, async () => {
      await (await Base.leaseConnection()).execute("SELECT 1");
    });
  });

  it("resets cache on context update", async () => {
    QueryLogs.cacheQueryLogTags = true;
    ExecutionContext.setKey("temporary", "value");
    QueryLogs.tags = [
      { temporary_tag: (ctx) => (ctx as Record<string, unknown>).temporary as string },
    ];

    await assertQueriesMatch(/SELECT 1 \/\*temporary_tag:value\*\//, undefined, false, async () => {
      await (await Base.leaseConnection()).execute("SELECT 1");
    });

    ExecutionContext.setKey("temporary", "new_value");

    await assertQueriesMatch(
      /SELECT 1 \/\*temporary_tag:new_value\*\//,
      undefined,
      false,
      async () => {
        await (await Base.leaseConnection()).execute("SELECT 1");
      },
    );
  });

  it("default tag behavior", async () => {
    QueryLogs.tags = ["application", "foo"];
    ExecutionContext.setKey("foo", "bar");
    await assertQueriesMatch(
      /\/\*application:active_record,foo:bar\*\//,
      undefined,
      false,
      async () => {
        await Dashboard.first();
      },
    );

    ExecutionContext.clear();
    ExecutionContext.setKey("application", "active_record");
    await assertQueriesMatch(/\/\*application:active_record\*\//, undefined, false, async () => {
      await Dashboard.first();
    });
  });

  it("connection is passed to tagging proc", async () => {
    const connection = await Base.leaseConnection();
    QueryLogs.tags = [
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
    ExecutionContext.setKey("connection", fakeConnection);
    QueryLogs.tags = [
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
        await (await Base.leaseConnection()).execute("SELECT 1");
      },
    );
  });

  it("empty comments are not added", async () => {
    QueryLogs.tags = [{ empty: () => null }];
    await assertQueriesMatch(/SELECT 1$/, undefined, false, async () => {
      await (await Base.leaseConnection()).execute("SELECT 1");
    });
  });

  it("sql commenter format", async () => {
    QueryLogs.tagsFormatter = "sqlcommenter";
    QueryLogs.tags = ["application"];
    await assertQueriesMatch(/\/\*application='active_record'\*\//, undefined, false, async () => {
      await Dashboard.first();
    });
  });

  it("custom basic tags", async () => {
    QueryLogs.tags = ["application", { custom_string: "test content" }];
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
    QueryLogs.tags = ["application", { custom_proc: () => "test content" }];
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
    QueryLogs.tags = [
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
    QueryLogs.tagsFormatter = "sqlcommenter";
    QueryLogs.tags = [
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
    QueryLogs.tagsFormatter = "sqlcommenter";
    QueryLogs.tags = [
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
    QueryLogs.tagsFormatter = "sqlcommenter";
    QueryLogs.tags = ["application", { custom_proc: () => 1234 }];
    await assertQueriesMatch(/custom_proc='1234'\*\//, undefined, false, async () => {
      await Dashboard.first();
    });
  });

  it.skipIf(adapterType === "postgres")("invalid encoding query", async () => {
    QueryLogs.tags = ["application"];
    await expect(
      (await Base.leaseConnection()).execute("select 1 as '\uD800'"),
    ).resolves.not.toThrow();
  });

  it("custom proc context tags", async () => {
    ExecutionContext.setKey("foo", "bar");
    QueryLogs.tags = [
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
    QueryLogs.tags = ["controller"];
    ExecutionContext.setKey("controller", "UsersController");
    expect(QueryLogs.tagContent()).toBe("controller:UsersController");
    QueryLogs.tags = [];
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

describe("QueryLogs.tagsFormatter", () => {
  afterEach(() => {
    QueryLogs.tagsFormatter = "legacy";
  });

  it("tracks the formatter name", () => {
    QueryLogs.tagsFormatter = "sqlcommenter";
    expect(QueryLogs.tagsFormatter).toBe("sqlcommenter");
  });

  it("raises ArgumentError for an unsupported formatter", () => {
    expect(() => (QueryLogs.tagsFormatter = "bogus")).toThrow(ArgumentError);
    expect(() => (QueryLogs.tagsFormatter = "bogus")).toThrow("Formatter is unsupported: bogus");
    expect(QueryLogs.tagsFormatter).toBe("legacy");
  });
});

describe("QueryLogs handlers", () => {
  afterEach(() => {
    QueryLogs.tags = [];
    ExecutionContext.clear();
  });

  it("calls an arity-0 hash tag with no context argument", () => {
    const received: number[] = [];
    QueryLogs.tags = [
      {
        zero: function () {
          received.push(arguments.length);
          return "z";
        },
        one: (ctx) => String(ctx !== undefined),
      },
    ];
    expect(QueryLogs.tagContent()).toBe("one:true,zero:z");
    expect(received).toEqual([0]);
  });

  it("resolves a false hash tag like Ruby's ||=", () => {
    QueryLogs.tags = [{ controller: false }];
    ExecutionContext.setKey("controller", "Users");
    expect(QueryLogs.tagContent()).toBe("controller:Users");
  });

  it("rebuilds handlers when taggings change", () => {
    const saved = QueryLogs.taggings;
    try {
      QueryLogs.tags = ["application"];
      QueryLogs.taggings = { ...saved, application: "tagged" };
      expect(QueryLogs.tagContent()).toBe("application:tagged");
    } finally {
      QueryLogs.taggings = saved;
    }
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
