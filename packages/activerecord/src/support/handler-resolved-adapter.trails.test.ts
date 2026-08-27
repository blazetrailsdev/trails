import { describe, it, afterAll, beforeAll, expect } from "vitest";
import { Base } from "../base.js";
import { useTransactionalTests } from "../test-fixtures/use-transactional-tests.js";

class HandlerResolvedPost extends Base {
  static {
    this.attribute("title", "string");
  }

  declare title: string;
}

class HandlerResolvedComment extends Base {
  declare body: string;
}

describe("handler-resolved adapter (Phase D-0)", () => {
  useTransactionalTests();

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
