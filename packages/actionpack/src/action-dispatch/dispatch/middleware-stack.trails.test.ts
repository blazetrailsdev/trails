import { describe, it, expect } from "vitest";
import { block } from "@blazetrails/ruby-compat";
import { MiddlewareStack, type MiddlewareBlock } from "../middleware/stack.js";
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

const builtBlocks: unknown[] = [];

class BlockMiddleware {
  private app: RackApp;
  constructor(app: RackApp, block?: MiddlewareBlock) {
    this.app = app;
    builtBlocks.push(block);
  }
  async call(env: RackEnv): Promise<RackResponse> {
    return this.app(env);
  }
}

describe("MiddlewareStackTest", () => {
  it("unshift and insert forward a trailing block to the middleware", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    const unshifted = block(() => "unshift");
    const inserted = block(() => "insert");
    stack.unshift(BlockMiddleware, unshifted);
    stack.insert(FooMiddleware, BlockMiddleware, inserted);
    expect(stack.get(0)?.block).toBe(unshifted);
    expect(stack.get(1)?.block).toBe(inserted);
    expect(stack.get(1)?.args).toEqual([]);

    builtBlocks.length = 0;
    stack.build(async () => [200, {}, []] as unknown as RackResponse);
    expect(builtBlocks).toEqual([inserted, unshifted]);
  });

  it("keeps an unmarked trailing callable positional, as Ruby keeps a Proc argument", () => {
    const stack = new MiddlewareStack();
    const proc = (): void => {};
    stack.use(BlockMiddleware, proc);
    expect(stack.last()?.args).toEqual([proc]);
    expect(stack.last()?.block).toBeUndefined();
  });

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
