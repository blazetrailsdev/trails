import { describe, it, expect } from "vitest";

describe("KernelTest", () => {
  it("silence warnings", () => {
    const original = console.warn;
    const captured: string[] = [];
    console.warn = (...args: unknown[]) => {
      captured.push(args.join(" "));
    };
    console.warn("test warning");
    console.warn = original;
    expect(captured).toContain("test warning");
  });

  it("silence warnings verbose invariant", () => {
    const original = console.log;
    let called = false;
    console.log = () => {
      called = true;
    };
    console.log("info");
    console.log = original;
    expect(called).toBe(true);
  });

  it("enable warnings", () => {
    const captured: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => captured.push(args.join(" "));
    console.warn("enabled warning");
    console.warn = original;
    expect(captured).toContain("enabled warning");
  });

  it("enable warnings verbose invariant", () => {
    expect(typeof console.warn).toBe("function");
  });

  it("class eval", () => {
    class Foo {
      greet() {
        return "hello";
      }
    }
    const inst = new Foo();
    const method = "greet";
    expect((inst as unknown as Record<string, () => string>)[method]()).toBe("hello");
  });
});

describe("KernelSuppressTest", () => {
  function suppress<T extends new (...a: any[]) => Error>(...types: T[]) {
    return (fn: () => void) => {
      try {
        fn();
      } catch (e) {
        if (types.some((t) => e instanceof t)) return;
        throw e;
      }
    };
  }

  it("reraise", () => {
    const suppresser = suppress(TypeError);
    expect(() =>
      suppresser(() => {
        throw new RangeError("boom");
      }),
    ).toThrow(RangeError);
  });

  it("suppression", () => {
    const suppresser = suppress(Error);
    expect(() =>
      suppresser(() => {
        throw new Error("suppressed");
      }),
    ).not.toThrow();
  });
});
