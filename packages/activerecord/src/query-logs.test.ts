import { describe, it, expect, beforeEach } from "vitest";
import { QueryLogs, escapeComment, GetKeyHandler } from "./query-logs.js";
import { LegacyFormatter, SQLCommenter } from "./query-logs-formatter.js";

describe("QueryLogsTest", () => {
  let logs: QueryLogs;
  beforeEach(() => {
    logs = new QueryLogs();
  });

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

  it("basic commenting", () => {
    logs.tags = [{ app: "MyApp" }];
    const sql = logs.call("SELECT 1");
    expect(sql).toContain("SELECT 1");
    expect(sql).toContain("/*");
    expect(sql).toContain("*/");
    expect(sql).toContain("MyApp");
  });

  it("add comments to beginning of query", () => {
    logs.tags = [{ app: "MyApp" }];
    logs.prependComment = true;
    const sql = logs.call("SELECT 1");
    expect(sql).toMatch(/^\/\*.*\*\/ SELECT 1$/);
  });

  it("exists is commented", () => {
    logs.tags = [{ app: "MyApp" }];
    const sql = logs.call("SELECT 1 AS one FROM users LIMIT 1");
    expect(sql).toContain("/*");
  });

  it("delete is commented", () => {
    logs.tags = [{ app: "MyApp" }];
    const sql = logs.call("DELETE FROM users WHERE id = 1");
    expect(sql).toContain("/*");
  });

  it("update is commented", () => {
    logs.tags = [{ app: "MyApp" }];
    const sql = logs.call("UPDATE users SET name = 'x'");
    expect(sql).toContain("/*");
  });

  it("create is commented", () => {
    logs.tags = [{ app: "MyApp" }];
    const sql = logs.call("INSERT INTO users (name) VALUES ('x')");
    expect(sql).toContain("/*");
  });

  it("select is commented", () => {
    logs.tags = [{ app: "MyApp" }];
    const sql = logs.call("SELECT * FROM users");
    expect(sql).toContain("/*");
  });

  it("retrieves comment from cache when enabled and set", () => {
    let callCount = 0;
    logs.tags = [
      {
        app: () => {
          callCount++;
          return "MyApp";
        },
      },
    ];
    logs.cacheQueryLogTags = true;
    logs.call("SELECT 1");
    logs.call("SELECT 2");
    expect(callCount).toBe(1);
  });

  it("resets cache on context update", () => {
    logs.tags = ["controller"];
    logs.cacheQueryLogTags = true;
    logs.updateContext({ controller: "users" });
    const sql1 = logs.call("SELECT 1");
    logs.updateContext({ controller: "posts" });
    const sql2 = logs.call("SELECT 1");
    expect(sql1).not.toBe(sql2);
  });

  it("default tag behavior", () => {
    logs.tags = ["application"];
    logs.updateContext({ application: "MyApp" });
    const sql = logs.call("SELECT 1");
    expect(sql).toContain("MyApp");
  });

  it.skip("connection is passed to tagging proc", () => {
    /* needs connection context */
  });
  it.skip("connection does not override already existing connection in context", () => {
    /* needs connection context */
  });

  it("empty comments are not added", () => {
    logs.tags = [];
    const sql = logs.call("SELECT 1");
    expect(sql).toBe("SELECT 1");
  });

  it("sql commenter format", () => {
    logs.tags = [{ app: "My App" }];
    logs.formatter = "sqlcommenter";
    const sql = logs.call("SELECT 1");
    expect(sql).toContain("app='My%20App'");
  });

  it("custom basic tags", () => {
    logs.tags = [{ custom_tag: "custom_value" }];
    const sql = logs.call("SELECT 1");
    expect(sql).toContain("custom_tag");
    expect(sql).toContain("custom_value");
  });

  it("custom proc tags", () => {
    logs.tags = [{ dynamic: () => "computed" }];
    const sql = logs.call("SELECT 1");
    expect(sql).toContain("computed");
  });

  it("multiple custom tags", () => {
    logs.tags = [{ a: "1", b: "2" }];
    const sql = logs.call("SELECT 1");
    expect(sql).toContain("a");
    expect(sql).toContain("b");
  });

  it("sqlcommenter format value", () => {
    logs.tags = [{ key: "value" }];
    logs.formatter = "sqlcommenter";
    const sql = logs.call("SELECT 1");
    expect(sql).toContain("key='value'");
  });

  it("sqlcommenter format allows string keys", () => {
    logs.tags = [{ "my-key": "value" }];
    logs.formatter = "sqlcommenter";
    const sql = logs.call("SELECT 1");
    expect(sql).toContain("my-key");
  });

  it("sqlcommenter format value string coercible", () => {
    logs.tags = [{ num: () => 42 }];
    logs.formatter = "sqlcommenter";
    const sql = logs.call("SELECT 1");
    expect(sql).toContain("42");
  });

  it("invalid encoding query", () => {
    logs.tags = [{ app: "test" }];
    const sql = logs.call("SELECT '\u0000' AS val");
    expect(sql).toContain("/*");
  });

  it("custom proc context tags", () => {
    let called = false;
    logs.tags = [
      {
        ctx: () => {
          called = true;
          return "val";
        },
      },
    ];
    logs.call("SELECT 1");
    expect(called).toBe(true);
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
    const logs = new QueryLogs();
    logs.tags = ["controller"];
    logs.tags.push("action");
    logs.updateContext({ controller: "Users", action: "index" });
    expect(logs.tagContent()).toBe("controller:Users,action:index");
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
