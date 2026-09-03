import { describe, it, expect } from "vitest";
import { MiddlewareStack } from "../middleware/stack.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";

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

class BazMiddleware {
  private app: RackApp;
  constructor(app: RackApp) {
    this.app = app;
  }
  async call(env: RackEnv): Promise<RackResponse> {
    return this.app(env);
  }
}

class HiyaMiddleware {
  private app: RackApp;
  constructor(app: RackApp) {
    this.app = app;
  }
  async call(env: RackEnv): Promise<RackResponse> {
    return this.app(env);
  }
}

class QuxMiddleware {
  private app: RackApp;
  private prefix: string;
  constructor(app: RackApp, prefix: string) {
    this.app = app;
    this.prefix = prefix;
  }
  async call(env: RackEnv): Promise<RackResponse> {
    return this.app(env);
  }
}

describe("MiddlewareStackTest", () => {
  it("use should push middleware as class onto the stack", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    expect(stack.length).toBe(1);
    expect(stack.get(0)?.klass).toBe(FooMiddleware);
  });

  it("use should push middleware class with arguments onto the stack", () => {
    const stack = new MiddlewareStack();
    stack.use(QuxMiddleware, "prefix");
    expect(stack.length).toBe(1);
    expect(stack.get(0)?.args).toEqual(["prefix"]);
  });

  it("insert inserts middleware at the integer index", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BazMiddleware);
    stack.insert(1, BarMiddleware);
    expect(stack.length).toBe(3);
    expect(stack.get(1)?.klass).toBe(BarMiddleware);
  });

  it("insert_after inserts middleware after the integer index", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BazMiddleware);
    stack.insertAfter(0, BarMiddleware);
    expect(stack.get(1)?.klass).toBe(BarMiddleware);
    expect(stack.get(2)?.klass).toBe(BazMiddleware);
  });

  it("insert_before inserts middleware before another middleware class", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BazMiddleware);
    stack.insertBefore(BazMiddleware, BarMiddleware);
    expect(stack.get(1)?.klass).toBe(BarMiddleware);
    expect(stack.get(2)?.klass).toBe(BazMiddleware);
  });

  it("insert_after inserts middleware after another middleware class", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BazMiddleware);
    stack.insertAfter(FooMiddleware, BarMiddleware);
    expect(stack.get(1)?.klass).toBe(BarMiddleware);
  });

  it("swaps one middleware out for another", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.swap(FooMiddleware, BarMiddleware);
    expect(stack.length).toBe(1);
    expect(stack.get(0)?.klass).toBe(BarMiddleware);
  });

  it("swaps one middleware out for same middleware class", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.swap(FooMiddleware, FooMiddleware);
    expect(stack.length).toBe(1);
    expect(stack.get(0)?.klass).toBe(FooMiddleware);
  });

  it("delete works", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
    stack.delete(FooMiddleware);
    expect(stack.length).toBe(1);
    expect(stack.get(0)?.klass).toBe(BarMiddleware);
  });

  it("delete ignores middleware not in the stack", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.delete(BarMiddleware);
    expect(stack.length).toBe(1);
  });

  it("delete! deletes the middleware", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.deleteStrict(FooMiddleware);
    expect(stack.length).toBe(0);
  });

  it("delete! requires the middleware to be in the stack", () => {
    const stack = new MiddlewareStack();
    expect(() => stack.deleteStrict(FooMiddleware)).toThrow();
  });

  it("move moves middleware at the integer index", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
    stack.move(0, BarMiddleware);
    expect(stack.get(0)?.klass).toBe(BarMiddleware);
    expect(stack.get(1)?.klass).toBe(FooMiddleware);
  });

  it("move requires the moved middleware to be in the stack", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
    expect(() => stack.move(0, BazMiddleware)).toThrow();
  });

  it("move preserves the arguments of the moved middleware", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
    stack.use(BazMiddleware, true, { foo: "bar" });
    stack.moveBefore(FooMiddleware, BazMiddleware);

    expect(stack.get(0)?.args).toEqual([true, { foo: "bar" }]);
  });

  it("move_before moves middleware before another middleware class", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
    stack.moveBefore(FooMiddleware, BarMiddleware);
    expect(stack.get(0)?.klass).toBe(BarMiddleware);
    expect(stack.get(1)?.klass).toBe(FooMiddleware);
  });

  it("move_after requires the moved middleware to be in the stack", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
    expect(() => stack.moveAfter(BarMiddleware, BazMiddleware)).toThrow();
  });

  it("move_after moves middleware after the integer index", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
    stack.insertAfter(BarMiddleware, BazMiddleware);
    stack.moveAfter(0, BazMiddleware);
    expect(stack.get(0)?.klass).toBe(FooMiddleware);
    expect(stack.get(1)?.klass).toBe(BazMiddleware);
    expect(stack.get(2)?.klass).toBe(BarMiddleware);
  });

  it("move_after moves middleware after another middleware class", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
    stack.insertAfter(BarMiddleware, BazMiddleware);
    stack.moveAfter(BarMiddleware, FooMiddleware);
    expect(stack.get(0)?.klass).toBe(BarMiddleware);
    expect(stack.get(1)?.klass).toBe(FooMiddleware);
    expect(stack.get(2)?.klass).toBe(BazMiddleware);
  });

  it("move_afters preserves the arguments of the moved middleware", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
    stack.use(BazMiddleware, true, { foo: "bar" });
    stack.moveAfter(FooMiddleware, BazMiddleware);

    expect(stack.get(1)?.args).toEqual([true, { foo: "bar" }]);
  });

  it("unshift adds a new middleware at the beginning of the stack", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.unshift(BarMiddleware);
    expect(stack.get(0)?.klass).toBe(BarMiddleware);
    expect(stack.get(1)?.klass).toBe(FooMiddleware);
  });

  it("raise an error on invalid index", () => {
    const stack = new MiddlewareStack();
    expect(() => stack.insert(HiyaMiddleware, BazMiddleware)).toThrow(
      /No such middleware to insert before/,
    );
    expect(() => stack.insertAfter(HiyaMiddleware, BazMiddleware)).toThrow(
      /No such middleware to insert after/,
    );
  });

  it("can check if Middleware are equal - Class", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    expect(stack.includes(FooMiddleware)).toBe(true);
    expect(stack.includes(BarMiddleware)).toBe(false);
  });

  it("includes a class", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    expect(stack.includes(FooMiddleware)).toBe(true);
  });

  it("includes a middleware", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    expect(stack.includes(FooMiddleware)).toBe(true);
  });

  it("build creates a callable app", async () => {
    const stack = new MiddlewareStack();
    const app = stack.build(async () => [200, {}, bodyFromString("OK")]);
    const [status] = await app({} as RackEnv);
    expect(status).toBe(200);
  });

  it("iterates over entries", () => {
    const stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
    const classes = [...stack].map((e) => e.klass);
    expect(classes).toEqual([FooMiddleware, BarMiddleware]);
  });
});
