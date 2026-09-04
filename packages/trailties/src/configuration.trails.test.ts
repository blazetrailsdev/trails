import { describe, expect, it } from "vitest";
import { MiddlewareStack } from "@blazetrails/actionpack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { MiddlewareStackProxy } from "./configuration.js";

class Unicorns {
  constructor(private app: (env: RackEnv) => Promise<RackResponse>) {}
  call(env: RackEnv): Promise<RackResponse> {
    return this.app(env);
  }
}
class Head {
  constructor(private app: (env: RackEnv) => Promise<RackResponse>) {}
  call(env: RackEnv): Promise<RackResponse> {
    return this.app(env);
  }
}

describe("MiddlewareStackProxy against a real MiddlewareStack", () => {
  it("replays use, insert_before and delete onto the stack in order", () => {
    const proxy = new MiddlewareStackProxy();
    proxy.use(Unicorns);
    proxy.insertBefore(Unicorns, Head);
    proxy.delete(Head);

    const stack = new MiddlewareStack();
    expect(proxy.mergeInto(stack)).toBe(stack);
    expect(stack.middlewares.map((m) => m.klass)).toEqual([Unicorns]);
  });

  it("plus concatenates both operation lists, deletes last", () => {
    const left = new MiddlewareStackProxy();
    left.use(Head);
    left.delete(Head);
    const right = new MiddlewareStackProxy();
    right.use(Unicorns);

    const stack = left.plus(right).mergeInto(new MiddlewareStack());
    expect(stack.middlewares.map((m) => m.klass)).toEqual([Unicorns]);
  });
});
