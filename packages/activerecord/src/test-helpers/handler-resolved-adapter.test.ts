/**
 * Phase D-0 / D-0a: verify that:
 *   1. Base.connectionHandler is bootstrapped per worker (isConnectedQ)
 *   2. defineSchema(schema) resolves the adapter from Base.adapter internally
 *   3. A model with no direct `static { this.adapter = ... }` assignment
 *      resolves its adapter via the Rails-shape handler chain
 *   4. (D-0a) A bare `class Post extends Base {}` with no explicit attribute
 *      declarations loads its schema via lazy reflection without deadlocking
 *      on SQLite :memory: + pool size 1.
 */
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { Base } from "../base.js";
import { defineSchema } from "./define-schema.js";
import { dropAllTables } from "./drop-all-tables.js";
import { clearAppliedSchemaSignatures } from "./define-schema.js";
import { setupHandlerSuite } from "./setup-handler-suite.js";

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
  // Bootstraps Base.connectionHandler and skips the global resetTestAdapterState()
  // for this suite. D-1..N test files use the same one-liner.
  setupHandlerSuite();

  // No adapter arg — resolves via Base.connectionHandler. This is the
  // new Rails-shape call pattern that D-1..N test files will use.
  beforeAll(async () => {
    await defineSchema({
      handler_resolved_posts: { title: "string" },
      handler_resolved_comments: { body: "string" },
    });
    // D-0a: load schema for the bare model (no explicit attribute declarations).
    // This deadlocked before the fix; now routes through the checked-out adapter.
    await HandlerResolvedComment.loadSchema();
  });

  afterAll(async () => {
    const adapter = Base.adapter;
    await dropAllTables(adapter);
    clearAppliedSchemaSignatures(adapter);
  });

  it("isConnectedQ() is true after bootstrapTestHandler()", () => {
    expect(Base.isConnectedQ()).toBe(true);
  });

  it("defineSchema(schema) without adapter arg creates the table via the handler", async () => {
    // If the table wasn't created, create would throw a "no such table" error.
    // This verifies defineSchema resolved Base.adapter internally.
    const post = await HandlerResolvedPost.create({ title: "hello" });
    expect(post.title).toBe("hello");
    expect(post.isPersisted()).toBe(true);
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
    expect(() => HandlerResolvedPost.adapter).not.toThrow();
  });
});
