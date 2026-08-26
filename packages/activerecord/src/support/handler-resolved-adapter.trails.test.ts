/**
 * Phase D-0 / D-0a: verify that:
 *   1. Base.connectionHandler is bootstrapped per worker (connectedQ)
 *   2. Base.connection resolves the adapter from the handler internally
 *   3. A model with no direct `static { this.adapter = ... }` assignment
 *      resolves its adapter via the Rails-shape handler chain
 *   4. (D-0a) A bare `class Post extends Base {}` with no explicit attribute
 *      declarations loads its schema via lazy reflection without deadlocking
 *      on SQLite :memory: + pool size 1.
 */
import { describe, it, afterAll, beforeAll, expect } from "vitest";
import { Base } from "../base.js";
import { useTransactionalTests } from "../test-fixtures/use-transactional-tests.js";

class HandlerResolvedPost extends Base {
  static {
    this.attribute("title", "string");
  }

  declare title: string;
}

// D-0a: bare Rails-shape model — no explicit attribute declarations.
// Schema is loaded via lazy reflection (loadSchemaFromAdapter).
class HandlerResolvedComment extends Base {
  declare body: string;
}

describe("handler-resolved adapter (Phase D-0)", () => {
  // Rails' `ActiveRecord::TestCase` runs with `use_transactional_tests` on
  // (test_fixtures.rb:113, :146), so the comment this file's lazy-reflection
  // case creates is rolled back rather than left behind on the shared
  // per-worker connection. The table itself is laid in `beforeAll`, outside the
  // per-test transaction, so it survives for every case.
  useTransactionalTests();

  // Table laid via Base.connection — the connection itself resolves through
  // Base.connectionHandler, the Rails-shape resolution path D-1..N files use.
  beforeAll(async () => {
    const adapter = Base.connection;
    await adapter.createTable("handler_resolved_comments", (t) => {
      t.string("body");
    });
    await HandlerResolvedComment.loadSchema();
  });

  afterAll(async () => {
    await Base.connection.dropTable("handler_resolved_comments", { ifExists: true });
  });

  it("connectedQ() is true after setupHandlerSuite()", () => {
    expect(Base.connectedQ()).toBe(true);
  });

  it("bare class extends Base loads schema via lazy reflection without deadlock", async () => {
    const comment = await HandlerResolvedComment.create({ body: "world" });
    expect(comment.body).toBe("world");
    expect(comment.isPersisted()).toBe(true);
  });

  it("model resolves adapter via handler — no static { this.adapter = X } needed", async () => {
    expect(Object.prototype.hasOwnProperty.call(HandlerResolvedPost, "_adapter")).toBe(false);
    expect(() => HandlerResolvedPost.connection).not.toThrow();
  });
});
