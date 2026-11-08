import { rbFSend } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { MiddlewareStack } from "@blazetrails/actionpack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { MiddlewareStackProxy } from "../lib/configuration.js";
import { Generators } from "../lib/configuration.js";

class Unicorns {
  constructor(private app: (env: RackEnv) => Promise<RackResponse>) {}
  call(env: RackEnv): Promise<RackResponse> {
    return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
  }
}
class Head {
  constructor(private app: (env: RackEnv) => Promise<RackResponse>) {}
  call(env: RackEnv): Promise<RackResponse> {
    return rbFSend(this.app, "call", env) as ReturnType<typeof this.app>;
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

describe("prototype-chain method_missing", () => {
  it("a subclass with a #private field still answers the dynamic names", () => {
    class Sub extends Generators {
      #secret = 1;
      secret(): number {
        return this.#secret;
      }
    }
    const sub = new Sub() as Sub & Record<string, (...args: unknown[]) => unknown>;
    expect(sub.secret()).toBe(1);
    sub.orm("active_record");
    expect(sub.orm()).toBe("active_record");
    expect(sub instanceof Generators).toBe(true);
    expect(Object.getPrototypeOf(sub)).toBe(Sub.prototype);
  });
});
