import { describe, it, expect } from "vitest";
import { BodyProxy } from "./body-proxy.js";

describe("Rack::BodyProxy", () => {
  it("call each on the wrapped body", () => {
    let called = false;
    const proxy = new BodyProxy(["foo"], () => {});
    proxy.each((str) => {
      called = true;
      expect(str).toBe("foo");
    });
    expect(called).toBe(true);
  });

  it("call close on the wrapped body", () => {
    let closed = false;
    const body = { close() { closed = true; } };
    const proxy = new BodyProxy(body, () => {});
    proxy.close();
    expect(closed).toBe(true);
  });

  it("only call close on the wrapped body if it responds to close", () => {
    const body: any[] = [];
    const proxy = new BodyProxy(body, () => {});
    expect(proxy.close()).toBeUndefined();
  });

  it("call the passed block on close", () => {
    let called = false;
    const proxy = new BodyProxy([], () => { called = true; });
    expect(called).toBe(false);
    proxy.close();
    expect(called).toBe(true);
  });

  it("call the passed block on close even if there is an exception", () => {
    const body = { close() { throw new Error("No!"); } };
    let called = false;
    const proxy = new BodyProxy(body, () => { called = true; });
    expect(called).toBe(false);
    let caught: Error | undefined;
    try {
      proxy.close();
    } catch (e: any) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(called).toBe(true);
  });

  it("allow multiple arguments in respond_to?", () => {
    const proxy = new BodyProxy([], () => {});
    expect(proxy.respondTo("foo")).toBe(false);
  });

  it("allows #method to work with delegated methods", () => {
    const body = { banana() { return "pear"; } };
    const proxy = new BodyProxy(body, () => {});
    expect(proxy.delegate("banana")).toBe("pear");
  });

  it("allows calling delegated methods with keywords", () => {
    const body = { banana(opts: { foo?: number } = {}) { return opts.foo; } };
    const proxy = new BodyProxy(body, () => {});
    expect(proxy.delegate("banana", { foo: 1 })).toBe(1);
  });

  it("respond to :to_ary if body does responds to it, and have to_ary call close", () => {
    let proxyClosed = false;
    const proxy = new BodyProxy([], () => { proxyClosed = true; });
    expect(proxy.respondTo("to_ary")).toBe(true);
    expect(proxyClosed).toBe(false);
    expect(proxy.toArray()).toEqual([]);
    expect(proxyClosed).toBe(true);
  });

  it("not respond to :to_ary if body does not respond to it", () => {
    // An iterator (non-array) body
    const body = { [Symbol.iterator]: function* () { yield 1; } };
    const proxy = new BodyProxy(body, () => {});
    expect(proxy.respondTo("to_ary")).toBe(false);
    expect(() => proxy.delegate("to_ary")).not.toThrow(); // toArray still works via iteration + close
  });

  it("not respond to :to_str", () => {
    const proxy = new BodyProxy("string body", () => {});
    expect(proxy.respondTo("to_str")).toBe(false);
    expect(() => proxy.delegate("to_str")).toThrow();
  });

  it("not respond to :to_path if body does not respond to it", () => {
    const proxy = new BodyProxy("string body", () => {});
    expect(proxy.respondTo("to_path")).toBe(false);
    expect(() => proxy.delegate("to_path")).toThrow();
  });

  it("not close more than one time", () => {
    let count = 0;
    const proxy = new BodyProxy([], () => {
      count += 1;
      if (count > 1) throw new Error("Block invoked more than 1 time!");
    });
    proxy.close();
    proxy.close();
    expect(count).toBe(1);
  });

  it("be closed when the callback is triggered", () => {
    let closedDuringCallback = false;
    const proxy = new BodyProxy([], () => { closedDuringCallback = proxy.closed; });
    proxy.close();
    expect(closedDuringCallback).toBe(true);
  });
});
