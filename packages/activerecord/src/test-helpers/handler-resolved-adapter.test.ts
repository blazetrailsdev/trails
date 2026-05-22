/**
 * Phase D-0: verify that:
 *   1. Base.connectionHandler is bootstrapped per worker (isConnectedQ)
 *   2. defineSchema(schema) resolves the adapter from Base.adapter internally
 *   3. A model with no direct `static { this.adapter = ... }` assignment
 *      resolves its adapter via the Rails-shape handler chain
 *
 * Attribute types are declared explicitly via `this.attribute(...)` to avoid
 * schema reflection (which would require the pool to checkout a second
 * connection, deadlocking on SQLite :memory: with pool size 1).  DB operations
 * go through Base._adapter — the single connection leased from the handler pool.
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

describe("handler-resolved adapter (Phase D-0)", () => {
  // Bootstraps Base.connectionHandler and skips the global resetTestAdapterState()
  // for this suite. D-1..N test files use the same one-liner.
  setupHandlerSuite();

  // No adapter arg — resolves via Base.connectionHandler. This is the
  // new Rails-shape call pattern that D-1..N test files will use.
  beforeAll(async () => {
    await defineSchema({ handler_resolved_posts: { title: "string" } });
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

  it("model resolves adapter via handler — no static { this.adapter = X } needed", async () => {
    expect(Object.prototype.hasOwnProperty.call(HandlerResolvedPost, "_adapter")).toBe(false);
    // The adapter is still accessible (via handler → pool → Base._adapter cache)
    expect(() => HandlerResolvedPost.adapter).not.toThrow();
  });
});
