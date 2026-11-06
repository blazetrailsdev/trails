import { describe, expect, it } from "vitest";
import { methodMissingProxy } from "./method-missing-proxy.js";

describe("methodMissingProxy (trails)", () => {
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
    const proxy = methodMissingProxy({}, { delegate: () => reflection }) as Reflection;
    expect(proxy.klass).toBe(Post);
    const name = proxy.name;
    expect(name()).toBe("posts");
  });
});
