import { rbFSend } from "@blazetrails/ruby-compat";
import { beforeEach, describe, it, expect } from "vitest";
import {
  Notifications,
  assertDifference,
  assertNoDifference,
  assertNothingRaised,
  assertRaises,
  type NotificationEvent as Event,
} from "@blazetrails/activesupport";
import { RuntimeError, block } from "@blazetrails/ruby-compat";
import { Middleware, MiddlewareStack, type MiddlewareBlock } from "../middleware/stack.js";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { bodyFromString } from "@blazetrails/rack";

type RackApp = (env: RackEnv) => Promise<RackResponse>;

class FooMiddleware {
  private app: RackApp;
  constructor(app: RackApp) {
    this.app = app;
  }
  async call(env: RackEnv): Promise<RackResponse> {
    return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
  }
}

class BarMiddleware {
  private app: RackApp;
  constructor(app: RackApp) {
    this.app = app;
  }
  async call(env: RackEnv): Promise<RackResponse> {
    return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
  }
}

class BazMiddleware {
  private app: RackApp;
  constructor(app: RackApp) {
    this.app = app;
  }
  async call(env: RackEnv): Promise<RackResponse> {
    return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
  }
}

class HiyaMiddleware {
  private app: RackApp;
  constructor(app: RackApp) {
    this.app = app;
  }
  async call(env: RackEnv): Promise<RackResponse> {
    return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
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
    return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
  }
}

class BlockMiddleware {
  private app: RackApp;
  readonly block?: MiddlewareBlock;
  constructor(app: RackApp, block?: MiddlewareBlock) {
    this.app = app;
    this.block = block;
  }
  async call(env: RackEnv): Promise<RackResponse> {
    return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
  }
}

describe("MiddlewareStackTest", () => {
  let stack: MiddlewareStack;

  beforeEach(() => {
    stack = new MiddlewareStack();
    stack.use(FooMiddleware);
    stack.use(BarMiddleware);
  });

  it("delete works", async () => {
    await assertDifference(
      () => stack.size,
      -1,
      null,
      () => {
        stack.delete(FooMiddleware);
      },
    );
  });

  it("delete ignores middleware not in the stack", async () => {
    await assertNoDifference(
      () => stack.size,
      null,
      () => {
        stack.delete(BazMiddleware);
      },
    );
  });

  it("delete! deletes the middleware", async () => {
    await assertDifference(
      () => stack.size,
      -1,
      null,
      () => {
        stack.deleteBang(FooMiddleware);
      },
    );
  });

  it("delete! requires the middleware to be in the stack", async () => {
    await assertRaises([RuntimeError], {}, () => {
      stack.deleteBang(BazMiddleware);
    });
  });

  it("use should push middleware as class onto the stack", async () => {
    await assertDifference(
      () => stack.size,
      () => {
        stack.use(BazMiddleware);
      },
    );
    expect(stack.last()?.klass).toBe(BazMiddleware);
  });

  it("use should push middleware class with arguments onto the stack", async () => {
    await assertDifference(
      () => stack.size,
      () => {
        stack.use(BazMiddleware, true, { foo: "bar" });
      },
    );
    expect(stack.last()?.klass).toBe(BazMiddleware);
    expect(stack.last()?.args).toEqual([true, { foo: "bar" }]);
  });

  it("use should push middleware class with block arguments onto the stack", async () => {
    const proc = block(() => {});
    await assertDifference(
      () => stack.size,
      () => {
        stack.use(BlockMiddleware, proc);
      },
    );
    expect(stack.last()?.klass).toBe(BlockMiddleware);
    expect(stack.last()?.block).toBe(proc);
  });

  it("insert inserts middleware at the integer index", () => {
    stack.insert(1, BazMiddleware);
    expect(stack.get(1)?.klass).toBe(BazMiddleware);
  });

  it("insert_after inserts middleware after the integer index", () => {
    stack.insertAfter(1, BazMiddleware);
    expect(stack.get(2)?.klass).toBe(BazMiddleware);
  });

  it("insert_before inserts middleware before another middleware class", () => {
    stack.insertBefore(BarMiddleware, BazMiddleware);
    expect(stack.get(1)?.klass).toBe(BazMiddleware);
  });

  it("insert_after inserts middleware after another middleware class", () => {
    stack.insertAfter(BarMiddleware, BazMiddleware);
    expect(stack.get(2)?.klass).toBe(BazMiddleware);
  });

  it("swaps one middleware out for another", () => {
    expect(stack.get(0)?.klass).toBe(FooMiddleware);
    stack.swap(FooMiddleware, BazMiddleware);
    expect(stack.get(0)?.klass).toBe(BazMiddleware);
  });

  it("swaps one middleware out for same middleware class", () => {
    expect(stack.get(0)?.klass).toBe(FooMiddleware);
    stack.swap(FooMiddleware, FooMiddleware, async () => [500, {}, ["error!"]]);
    expect(stack.get(0)?.klass).toBe(FooMiddleware);
  });

  it("move moves middleware at the integer index", () => {
    stack.move(0, BarMiddleware);
    expect(stack.get(0)?.klass).toBe(BarMiddleware);
    expect(stack.get(1)?.klass).toBe(FooMiddleware);
  });

  it("move requires the moved middleware to be in the stack", async () => {
    await assertRaises([RuntimeError], {}, () => {
      stack.move(0, BazMiddleware);
    });
  });

  it("move preserves the arguments of the moved middleware", () => {
    stack.use(BazMiddleware, true, { foo: "bar" });
    stack.moveBefore(FooMiddleware, BazMiddleware);

    expect(stack.get(0)?.args).toEqual([true, { foo: "bar" }]);
  });

  it("move_before moves middleware before another middleware class", () => {
    stack.moveBefore(FooMiddleware, BarMiddleware);
    expect(stack.get(0)?.klass).toBe(BarMiddleware);
    expect(stack.get(1)?.klass).toBe(FooMiddleware);
  });

  it("move_after requires the moved middleware to be in the stack", async () => {
    await assertRaises([RuntimeError], {}, () => {
      stack.moveAfter(BarMiddleware, BazMiddleware);
    });
  });

  it("move_after moves middleware after the integer index", () => {
    stack.insertAfter(BarMiddleware, BazMiddleware);
    stack.moveAfter(0, BazMiddleware);
    expect(stack.get(0)?.klass).toBe(FooMiddleware);
    expect(stack.get(1)?.klass).toBe(BazMiddleware);
    expect(stack.get(2)?.klass).toBe(BarMiddleware);
  });

  it("move_after moves middleware after another middleware class", () => {
    stack.insertAfter(BarMiddleware, BazMiddleware);
    stack.moveAfter(BarMiddleware, FooMiddleware);
    expect(stack.get(0)?.klass).toBe(BarMiddleware);
    expect(stack.get(1)?.klass).toBe(FooMiddleware);
    expect(stack.get(2)?.klass).toBe(BazMiddleware);
  });

  it("move_afters preserves the arguments of the moved middleware", () => {
    stack.use(BazMiddleware, true, { foo: "bar" });
    stack.moveAfter(FooMiddleware, BazMiddleware);

    expect(stack.get(1)?.args).toEqual([true, { foo: "bar" }]);
  });

  it("unshift adds a new middleware at the beginning of the stack", () => {
    stack.unshift(BazMiddleware);
    expect(stack.get(0)?.klass).toBe(BazMiddleware);
  });

  it("raise an error on invalid index", () => {
    expect(() => stack.insert(HiyaMiddleware, BazMiddleware)).toThrow(
      /No such middleware to insert before/,
    );
    expect(() => stack.insertAfter(HiyaMiddleware, BazMiddleware)).toThrow(
      /No such middleware to insert after/,
    );
  });

  it("can check if Middleware are equal - Class", () => {
    expect(stack.last()!.equals(BarMiddleware)).toBe(true);
  });

  it("includes a class", () => {
    expect(stack.includes(BarMiddleware)).toBe(true);
  });

  it("can check if Middleware are equal - Middleware", () => {
    expect(stack.last()!.equals(stack.last())).toBe(true);
  });

  it("instruments the execution of middlewares", async () => {
    const events: Event[] = [];

    const subscriber = (event: Event): void => {
      events.push(event);
    };

    await Notifications.subscribed(subscriber, "process_middleware.action_dispatch", async () => {
      const app = stack.build(async () => [200, {}, bodyFromString("")]);
      await assertNothingRaised(() => rbFSend(app, "call", {} as RackEnv) as Promise<RackResponse>);
    });

    expect(events.length).toBe(2);
    expect(events.map((e) => e.payload.middleware)).toEqual(["BarMiddleware", "FooMiddleware"]);
  });

  it("includes a middleware", () => {
    expect(stack.includes(new Middleware(BarMiddleware, null, null))).toBe(true);
  });

  it("build creates a callable app", async () => {
    const stack = new MiddlewareStack();
    const app = stack.build(async () => [200, {}, bodyFromString("OK")]);
    const [status] = await (rbFSend(app, "call", {} as RackEnv) as Promise<RackResponse>);
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
