import { describe, expect, it } from "vitest";

describe("RemoveMethodTest", () => {
  it("remove method from an object", () => {
    class Foo {
      greet() {
        return "hello";
      }
    }
    const proto = Foo.prototype as unknown as Record<string, unknown>;
    expect(typeof proto.greet).toBe("function");
    delete proto.greet;
    expect(proto.greet).toBeUndefined();
  });

  it("remove singleton method from an object", () => {
    const obj = {
      greet() {
        return "hello";
      },
    } as Record<string, unknown>;
    expect(typeof obj.greet).toBe("function");
    delete obj.greet;
    expect(obj.greet).toBeUndefined();
  });

  it("redefine method in an object", () => {
    const obj = {
      greet() {
        return "hello";
      },
    };
    expect(obj.greet()).toBe("hello");
    obj.greet = () => "world";
    expect(obj.greet()).toBe("world");
  });
});
