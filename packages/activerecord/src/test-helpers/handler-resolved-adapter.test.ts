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
import { bootstrapTestHandler } from "./bootstrap-test-handler.js";
import { pushSkipGlobalReset, popSkipGlobalReset } from "./skip-global-reset.js";

class HandlerResolvedPost extends Base {
  static {
    // Declare attribute types explicitly so the getter/setter is installed
    // without schema reflection (which would re-enter the pool).
    this.attribute("title", "string");
  }

  declare title: string;
}

describe("handler-resolved adapter (Phase D-0)", () => {
  beforeAll(async () => {
    // Bootstrap the handler for this test file. Opt-in (not global) so that
    // tests expecting "no adapter configured" aren't affected.
    await bootstrapTestHandler();
    // Skip the global resetTestAdapterState() beforeEach for this suite.
    // On PG/MySQL the shared adapter and Base.adapter share the same DB,
    // so the global reset would drop handler_resolved_posts between tests.
    // withTransactionalFixtures can't be used here because on SQLite the
    // handler pool uses size=1 and pinConnectionBang would deadlock.
    pushSkipGlobalReset();
    // No adapter arg — resolves via Base.connectionHandler. This is the
    // new Rails-shape call pattern that D-1..N test files will use.
    await defineSchema({ handler_resolved_posts: { title: "string" } });
  });

  afterAll(async () => {
    popSkipGlobalReset();
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
