import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import { SqlJsAdapter } from "../sql-js-adapter.js";
import { VirtualFS } from "../virtual-fs.js";
import {
  applyDiff,
  isDiffApplied,
  runCheck,
  runCheckpoint,
  computeHighlightRanges,
} from "./diff-engine.js";
import type { FileDiff, CheckSpec } from "./types.js";

let SQL: SqlJsStatic;
let adapter: SqlJsAdapter;
let vfs: VirtualFS;

beforeAll(async () => {
  SQL = await initSqlJs();
});

beforeEach(() => {
  adapter = new SqlJsAdapter(new SQL.Database());
  vfs = new VirtualFS(adapter);
});

describe("applyDiff", () => {
  it("creates a new file with operation: create", () => {
    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "create",
      content:
        'import { Base } from "@blazetrails/activerecord";\n\nexport class User extends Base {}',
    };

    const result = applyDiff(vfs, diff);
    expect(result.success).toBe(true);

    const file = vfs.read("app/models/user.ts");
    expect(file).not.toBeNull();
    expect(file!.content).toBe(diff.content);
  });

  it("deletes a file with operation: delete", () => {
    vfs.write("app/models/old.ts", "old content");
    expect(vfs.exists("app/models/old.ts")).toBe(true);

    const result = applyDiff(vfs, { path: "app/models/old.ts", operation: "delete" });
    expect(result.success).toBe(true);
    expect(vfs.exists("app/models/old.ts")).toBe(false);
  });

  it("returns error when deleting a nonexistent file", () => {
    const result = applyDiff(vfs, { path: "nope.ts", operation: "delete" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("inserts lines after anchor with position: after", () => {
    vfs.write(
      "app/models/user.ts",
      ["class User extends Base {", '  this.attribute("name", "string");', "}"].join("\n"),
    );

    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: 'this.attribute("name"',
          position: "after",
          insertLines: ['  this.attribute("email", "string");'],
        },
      ],
    };

    const result = applyDiff(vfs, diff);
    expect(result.success).toBe(true);

    const content = vfs.read("app/models/user.ts")!.content;
    const lines = content.split("\n");
    expect(lines[1]).toContain('this.attribute("name"');
    expect(lines[2]).toContain('this.attribute("email"');
  });

  it("inserts lines before anchor with position: before", () => {
    vfs.write("app/models/user.ts", ["class User extends Base {", "}"].join("\n"));

    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: "}",
          position: "before",
          insertLines: ['  this.attribute("name", "string");'],
        },
      ],
    };

    const result = applyDiff(vfs, diff);
    expect(result.success).toBe(true);

    const lines = vfs.read("app/models/user.ts")!.content.split("\n");
    expect(lines[1]).toContain('this.attribute("name"');
    expect(lines[2]).toBe("}");
  });

  it("replaces lines at anchor with position: replace", () => {
    vfs.write("config/routes.ts", ["// Routes", 'root("welcome#index");', "// End"].join("\n"));

    const diff: FileDiff = {
      path: "config/routes.ts",
      operation: "modify",
      hunks: [
        {
          anchor: 'root("welcome#index")',
          position: "replace",
          deleteCount: 1,
          insertLines: ['root("posts#index");'],
        },
      ],
    };

    const result = applyDiff(vfs, diff);
    expect(result.success).toBe(true);

    const lines = vfs.read("config/routes.ts")!.content.split("\n");
    expect(lines[1]).toContain('root("posts#index")');
  });

  it("replaces lines and removes anchor text entirely", () => {
    vfs.write("config/routes.ts", ["// Routes", "legacy_root;", "// End"].join("\n"));

    const diff: FileDiff = {
      path: "config/routes.ts",
      operation: "modify",
      hunks: [
        {
          anchor: "legacy_root;",
          position: "replace",
          deleteCount: 1,
          insertLines: ['get("health");'],
        },
      ],
    };

    const result = applyDiff(vfs, diff);
    expect(result.success).toBe(true);

    const lines = vfs.read("config/routes.ts")!.content.split("\n");
    expect(lines[1]).toBe('get("health");');
    expect(lines.join("\n")).not.toContain("legacy_root;");
  });

  it("replaces multiple lines with deleteCount > 1", () => {
    vfs.write(
      "app/models/user.ts",
      ["class User extends Base {", "  // old line 1", "  // old line 2", "}"].join("\n"),
    );

    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: "// old line 1",
          position: "replace",
          deleteCount: 2,
          insertLines: ['  this.attribute("name", "string");'],
        },
      ],
    };

    const result = applyDiff(vfs, diff);
    expect(result.success).toBe(true);

    const lines = vfs.read("app/models/user.ts")!.content.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain('this.attribute("name"');
  });

  it("returns error when anchor matches multiple lines", () => {
    vfs.write(
      "app/models/user.ts",
      [
        "class User extends Base {",
        '  this.attribute("name", "string");',
        '  this.attribute("email", "string");',
        "}",
      ].join("\n"),
    );

    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: "this.attribute(",
          position: "after",
          insertLines: ["  // new line"],
        },
      ],
    };

    const result = applyDiff(vfs, diff);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/matched.*2.*lines/i);
  });

  it("returns error when anchor is not found", () => {
    vfs.write("app/models/user.ts", "class User {}");

    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: "nonexistent anchor text",
          position: "after",
          insertLines: ["new line"],
        },
      ],
    };

    const result = applyDiff(vfs, diff);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/anchor not found/i);
  });

  it("returns error when modifying a nonexistent file", () => {
    const result = applyDiff(vfs, {
      path: "nope.ts",
      operation: "modify",
      hunks: [{ anchor: "x", position: "after", insertLines: ["y"] }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it("applies multiple hunks in sequence", () => {
    vfs.write(
      "app/models/user.ts",
      [
        "class User extends Base {",
        '  this.attribute("name", "string");',
        "",
        '  this.validates("name", { presence: true });',
        "}",
      ].join("\n"),
    );

    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: 'this.attribute("name"',
          position: "after",
          insertLines: ['  this.attribute("email", "string");'],
        },
        {
          anchor: 'this.validates("name"',
          position: "after",
          insertLines: ['  this.validates("email", { presence: true });'],
        },
      ],
    };

    const result = applyDiff(vfs, diff);
    expect(result.success).toBe(true);

    const content = vfs.read("app/models/user.ts")!.content;
    expect(content).toContain('this.attribute("email"');
    expect(content).toContain('this.validates("email"');
  });
});

describe("isDiffApplied", () => {
  it("returns true when a created file exists with matching content", () => {
    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "create",
      content: "class User {}",
    };

    expect(isDiffApplied(vfs, diff)).toBe(false);

    vfs.write("app/models/user.ts", "class User {}");
    expect(isDiffApplied(vfs, diff)).toBe(true);
  });

  it("returns false when created file has different content", () => {
    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "create",
      content: "class User {}",
    };

    vfs.write("app/models/user.ts", "class Post {}");
    expect(isDiffApplied(vfs, diff)).toBe(false);
  });

  it("returns true when a deleted file no longer exists", () => {
    const diff: FileDiff = { path: "old.ts", operation: "delete" };

    expect(isDiffApplied(vfs, diff)).toBe(true);

    vfs.write("old.ts", "content");
    expect(isDiffApplied(vfs, diff)).toBe(false);
  });

  it("detects when modify hunks have already been applied", () => {
    vfs.write(
      "app/models/user.ts",
      [
        "class User extends Base {",
        '  this.attribute("name", "string");',
        '  this.attribute("email", "string");',
        "}",
      ].join("\n"),
    );

    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: 'this.attribute("name"',
          position: "after",
          insertLines: ['  this.attribute("email", "string");'],
        },
      ],
    };

    expect(isDiffApplied(vfs, diff)).toBe(true);
  });

  it("returns false when modify hunks have not been applied", () => {
    vfs.write(
      "app/models/user.ts",
      ["class User extends Base {", '  this.attribute("name", "string");', "}"].join("\n"),
    );

    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: 'this.attribute("name"',
          position: "after",
          insertLines: ['  this.attribute("email", "string");'],
        },
      ],
    };

    expect(isDiffApplied(vfs, diff)).toBe(false);
  });

  it("detects replace hunk as applied even when anchor text was removed", () => {
    vfs.write("config/routes.ts", ["// Routes", 'get("health");', "// End"].join("\n"));

    const diff: FileDiff = {
      path: "config/routes.ts",
      operation: "modify",
      hunks: [
        {
          anchor: "legacy_root;",
          position: "replace",
          deleteCount: 1,
          insertLines: ['get("health");'],
        },
      ],
    };

    expect(isDiffApplied(vfs, diff)).toBe(true);
  });
});

describe("runCheck", () => {
  it("table_exists passes when table exists", () => {
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");

    const result = runCheck(vfs, adapter, { type: "table_exists", target: "users" });
    expect(result.passed).toBe(true);
  });

  it("table_exists fails when table does not exist", () => {
    const result = runCheck(vfs, adapter, { type: "table_exists", target: "users" });
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/does not exist/);
  });

  it("file_exists passes when file exists", () => {
    vfs.write("app/models/user.ts", "content");

    const result = runCheck(vfs, adapter, { type: "file_exists", target: "app/models/user.ts" });
    expect(result.passed).toBe(true);
  });

  it("file_exists fails when file does not exist", () => {
    const result = runCheck(vfs, adapter, { type: "file_exists", target: "app/models/user.ts" });
    expect(result.passed).toBe(false);
  });

  it("file_contains passes when file contains the value", () => {
    vfs.write("app/models/user.ts", 'class User extends Base {\n  this.attribute("name");\n}');

    const result = runCheck(vfs, adapter, {
      type: "file_contains",
      target: "app/models/user.ts",
      value: 'this.attribute("name")',
    });
    expect(result.passed).toBe(true);
  });

  it("file_contains fails when file does not contain the value", () => {
    vfs.write("app/models/user.ts", "class User extends Base {}");

    const result = runCheck(vfs, adapter, {
      type: "file_contains",
      target: "app/models/user.ts",
      value: "this.attribute",
    });
    expect(result.passed).toBe(false);
  });

  it("query_returns passes when query returns expected row count", () => {
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    adapter.execRaw("INSERT INTO users (name) VALUES ('Alice')");
    adapter.execRaw("INSERT INTO users (name) VALUES ('Bob')");

    const result = runCheck(vfs, adapter, {
      type: "query_returns",
      target: "users",
      value: "SELECT * FROM users",
      expected: 2,
    });
    expect(result.passed).toBe(true);
  });

  it("query_returns fails when row count does not match", () => {
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    adapter.execRaw("INSERT INTO users (name) VALUES ('Alice')");

    const result = runCheck(vfs, adapter, {
      type: "query_returns",
      target: "users",
      value: "SELECT * FROM users",
      expected: 5,
    });
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/expected 5 rows, got 1/i);
  });

  it("query_returns passes when no expected count and results exist", () => {
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)");
    adapter.execRaw("INSERT INTO users (name) VALUES ('Alice')");

    const result = runCheck(vfs, adapter, {
      type: "query_returns",
      target: "users",
      value: "SELECT * FROM users",
    });
    expect(result.passed).toBe(true);
  });

  it("query_returns handles SQL errors gracefully", () => {
    const result = runCheck(vfs, adapter, {
      type: "query_returns",
      target: "users",
      value: "SELECT * FROM nonexistent_table",
    });
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/sql error/i);
  });

  it("route_responds returns graceful failure (deferred)", () => {
    const result = runCheck(vfs, adapter, {
      type: "route_responds",
      target: "/users",
      value: "GET",
    });
    expect(result.passed).toBe(false);
    expect(result.error).toMatch(/app server/i);
  });
});

describe("runCheckpoint", () => {
  it("returns allPassed: true when all checks pass", () => {
    vfs.write("app/models/user.ts", "class User {}");
    adapter.execRaw("CREATE TABLE users (id INTEGER PRIMARY KEY)");

    const checks: CheckSpec[] = [
      { type: "file_exists", target: "app/models/user.ts" },
      { type: "table_exists", target: "users" },
    ];

    const result = runCheckpoint(vfs, adapter, checks);
    expect(result.allPassed).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  it("returns allPassed: false when any check fails", () => {
    vfs.write("app/models/user.ts", "class User {}");

    const checks: CheckSpec[] = [
      { type: "file_exists", target: "app/models/user.ts" },
      { type: "table_exists", target: "users" },
    ];

    const result = runCheckpoint(vfs, adapter, checks);
    expect(result.allPassed).toBe(false);
    expect(result.results[0].passed).toBe(true);
    expect(result.results[1].passed).toBe(false);
  });
});

describe("computeHighlightRanges", () => {
  it("returns ranges for lines inserted after anchor", () => {
    const content = [
      "class User extends Base {",
      '  this.attribute("name", "string");',
      '  this.attribute("email", "string");',
      "}",
    ].join("\n");

    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: 'this.attribute("name"',
          position: "after",
          insertLines: ['  this.attribute("email", "string");'],
        },
      ],
    };

    const ranges = computeHighlightRanges(content, diff);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ startLine: 3, endLine: 3 });
  });

  it("returns ranges for lines inserted before anchor", () => {
    const content = ['  this.attribute("name", "string");', "class User extends Base {", "}"].join(
      "\n",
    );

    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: "class User",
          position: "before",
          insertLines: ['  this.attribute("name", "string");'],
        },
      ],
    };

    const ranges = computeHighlightRanges(content, diff);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ startLine: 1, endLine: 1 });
  });

  it("returns ranges for replaced lines", () => {
    const content = ["// Routes", 'root("posts#index");', "// End"].join("\n");

    const diff: FileDiff = {
      path: "config/routes.ts",
      operation: "modify",
      hunks: [
        {
          anchor: 'root("posts#index")',
          position: "replace",
          deleteCount: 1,
          insertLines: ['root("posts#index");'],
        },
      ],
    };

    const ranges = computeHighlightRanges(content, diff);
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toEqual({ startLine: 2, endLine: 2 });
  });

  it("returns empty array for non-modify operations", () => {
    const diff: FileDiff = { path: "test.ts", operation: "create", content: "hello" };
    expect(computeHighlightRanges("hello", diff)).toEqual([]);
  });

  it("handles multiple hunks", () => {
    const content = [
      "class User extends Base {",
      '  this.attribute("name", "string");',
      '  this.attribute("email", "string");',
      "",
      '  this.validates("name", { presence: true });',
      '  this.validates("email", { presence: true });',
      "}",
    ].join("\n");

    const diff: FileDiff = {
      path: "app/models/user.ts",
      operation: "modify",
      hunks: [
        {
          anchor: 'this.attribute("name"',
          position: "after",
          insertLines: ['  this.attribute("email", "string");'],
        },
        {
          anchor: 'this.validates("name"',
          position: "after",
          insertLines: ['  this.validates("email", { presence: true });'],
        },
      ],
    };

    const ranges = computeHighlightRanges(content, diff);
    expect(ranges).toHaveLength(2);
  });
});
