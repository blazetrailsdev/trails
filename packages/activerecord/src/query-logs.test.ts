import { describe, it, expect, beforeEach } from "vitest";
import { QueryLogs, escapeComment } from "./query-logs.js";

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
