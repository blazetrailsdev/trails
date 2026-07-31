/**
 * Phase D-0 / D-0a: verify that:
 *   1. Base.connectionHandler is bootstrapped per worker (isConnectedQ)
 *   2. Base.connection resolves the adapter from the handler internally
 *   3. A model with no direct `static { this.adapter = ... }` assignment
 *      resolves its adapter via the Rails-shape handler chain
 *   4. (D-0a) A bare `class Post extends Base {}` with no explicit attribute
 *      declarations loads its schema via lazy reflection without deadlocking
 *      on SQLite :memory: + pool size 1.
 */
import { describe, it, afterAll, beforeAll, expect } from "vitest";
import { Base } from "../base.js";
import { skipGlobalResetForFile } from "./skip-global-reset.js";

class HandlerResolvedPost extends Base {
  static {
    // Declare attribute types explicitly so the getter/setter is installed
    // without schema reflection (which would re-enter the pool).
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
  skipGlobalResetForFile();

  // Table laid via Base.connection — the connection itself resolves through
  // Base.connectionHandler, the Rails-shape resolution path D-1..N files use.
  beforeAll(async () => {
    const adapter = Base.connection;
    await adapter.createTable("handler_resolved_comments", (t) => t.string("body"));
    // D-0a: load schema for the bare model (no explicit attribute declarations).
    // This deadlocked before the fix; now routes through the checked-out adapter.
    await HandlerResolvedComment.loadSchema();
  });

  afterAll(async () => {
    await Base.connection.dropTable("handler_resolved_comments", { ifExists: true });
  });

  it("isConnectedQ() is true after setupHandlerSuite()", () => {
    expect(Base.isConnectedQ()).toBe(true);
  });

  it("bare class extends Base loads schema via lazy reflection without deadlock", async () => {
    // D-0a: no explicit this.attribute() — schema comes from loadSchemaFromAdapter.
    // On SQLite :memory: + pool size 1 this deadlocked before the fix.
    const comment = await HandlerResolvedComment.create({ body: "world" });
    expect(comment.body).toBe("world");
    expect(comment.isPersisted()).toBe(true);
  });

  it("model resolves adapter via handler — no static { this.adapter = X } needed", async () => {
    expect(Object.prototype.hasOwnProperty.call(HandlerResolvedPost, "_adapter")).toBe(false);
    // The adapter is still accessible (via handler → pool → Base._adapter cache)
    expect(() => HandlerResolvedPost.connection).not.toThrow();
  });
});
