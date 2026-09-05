import { describe, it, expect } from "vitest";
import { MiddlewareStack } from "../middleware/stack.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";

type RackApp = (env: RackEnv) => Promise<RackResponse>;

class FooMiddleware {
  private app: RackApp;
  constructor(app: RackApp) {
    this.app = app;
  }
  async call(env: RackEnv): Promise<RackResponse> {
    return this.app(env);
  }
}

class BarMiddleware {
  private app: RackApp;
  constructor(app: RackApp) {
    this.app = app;
  }
  async call(env: RackEnv): Promise<RackResponse> {
    return this.app(env);
  }
}

describe("MiddlewareStackTest", () => {
  it("delete rejects every entry whose name matches, not just the first", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
    stack.use(FooMiddleware);

    expect(stack.delete(FooMiddleware)).toBe(stack.middlewares);
    expect(stack.length).toBe(1);
    expect(stack.get(0)?.klass).toBe(BarMiddleware);
  });

  it("delete answers null when nothing was rejected", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);

    expect(stack.delete(BarMiddleware)).toBeNull();
    expect(stack.length).toBe(1);
  });

  it("delete! names the middleware it could not remove", () => {
    const stack = new MiddlewareStack();

    expect(() => stack.deleteBang(FooMiddleware)).toThrow(
      "No such middleware to remove: FooMiddleware",
    );
  });
});
