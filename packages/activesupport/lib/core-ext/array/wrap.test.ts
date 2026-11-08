import { describe, expect, it } from "vitest";
import { wrap } from "../../index.js";
import { assertSame } from "../../testing/assertions.js";

describe("WrapTest", () => {
  class FakeCollection {
    toAry(): string[] {
      return ["foo", "bar"];
    }
  }

  class Proxy {
    constructor(readonly target: unknown) {}
  }

  class DoubtfulToAry {
    toAry(): string[] {
      return ":not_an_array" as unknown as string[];
    }
  }

  class NilToAry {
    toAry(): string[] | null {
      return null;
    }
  }

  it("array", () => {
    const ary = ["foo", "bar"];
    assertSame(ary, wrap(ary));
  });

  it("nil", () => {
    expect(wrap(null)).toEqual([]);
  });

  it("object", () => {
    const o = {};
    expect(wrap(o)).toEqual([o]);
  });

  it("string", () => {
    expect(wrap("foo")).toEqual(["foo"]);
  });

  it("string with newline", () => {
    expect(wrap("foo\nbar")).toEqual(["foo\nbar"]);
  });

  it("object with to ary", () => {
    expect(wrap(new FakeCollection())).toEqual(["foo", "bar"]);
  });

  it("proxy object", () => {
    const p = new Proxy({});
    expect(wrap(p)).toEqual([p]);
  });

  it("proxy to object with to ary", () => {
    const p = new Proxy(new FakeCollection());
    expect(wrap(p)).toEqual([p]);
  });

  it("struct", () => {
    const o = { foo: 123 };
    expect(wrap(o)).toEqual([o]);
  });

  it("wrap returns wrapped if to ary returns nil", () => {
    const o = new NilToAry();
    expect(wrap(o)).toEqual([o]);
  });

  it("wrap does not complain if to ary does not return an array", () => {
    expect(wrap(new DoubtfulToAry())).toEqual(new DoubtfulToAry().toAry());
  });
});
