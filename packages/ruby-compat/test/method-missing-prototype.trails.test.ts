import { describe, expect, it } from "vitest";
import { methodMissingPrototype } from "../lib/method-missing-proxy.js";

describe("methodMissingPrototype (trails)", () => {
  it("passes a getter-returned class through unbound and binds methods", () => {
    class Post {}
    class Reflection {
      get klass(): typeof Post {
        return Post;
      }
      name(): string {
        return this === reflection ? "posts" : "unbound";
      }
    }
    const reflection = new Reflection();
    class Wrapper {
      methodMissing(m: string): never {
        throw new Error(`undefined method '${m}'`);
      }
      static {
        methodMissingPrototype(this, { delegate: () => reflection });
      }
    }
    const wrapper = new Wrapper() as unknown as Reflection;
    expect(wrapper.klass).toBe(Post);
    const name = wrapper.name;
    expect(name()).toBe("posts");
  });

  it("maps a delegate method's result through wrap", () => {
    class Box {
      constructor(readonly inner: string) {}
      methodMissing(m: string): never {
        throw new Error(`undefined method '${m}'`);
      }
      static {
        methodMissingPrototype(Box, {
          delegate: (receiver) => receiver.inner,
          wrap: (_receiver, result) => (typeof result === "string" ? new Box(result) : result),
        });
      }
    }
    const box = new Box("abc") as Box & { toUpperCase(): unknown; indexOf(s: string): unknown };
    expect(box.toUpperCase()).toBeInstanceOf(Box);
    expect((box.toUpperCase() as Box).inner).toBe("ABC");
    expect(box.indexOf("b")).toBe(1);
  });
});
