import { describe, expect, it } from "vitest";
import { tryBang, tryCall, tryWith } from "../../try.js";

describe("ObjectTryTest", () => {
  it("nonexisting method", () => {
    const obj = { name: "Alice" };
    expect(tryCall(obj, "nonexistent")).toBeUndefined();
  });

  it("nonexisting method with arguments", () => {
    const obj = { name: "Alice" };
    expect(tryCall(obj, "nonexistent", "arg")).toBeUndefined();
  });

  it("nonexisting method bang", () => {
    const obj = { name: "Alice" };
    expect(() => tryBang(obj, "nonexistent")).toThrow();
  });

  it("nonexisting method with arguments bang", () => {
    const obj = { name: "Alice" };
    expect(() => tryBang(obj, "nonexistent", "arg")).toThrow();
  });

  it("valid method", () => {
    const obj = {
      upcase() {
        return "HELLO";
      },
    };
    expect(tryCall(obj, "upcase")).toBe("HELLO");
  });

  it("argument forwarding", () => {
    const obj = {
      slice(n: number) {
        return "hello".slice(0, n);
      },
    };
    expect(tryCall(obj, "slice", 3)).toBe("hel");
  });

  it("block forwarding", () => {
    const obj = { name: "Alice" };
    expect(tryWith(obj, (o) => o.name.toUpperCase())).toBe("ALICE");
  });

  it("nil to type", () => {
    expect(tryCall(null, "upcase")).toBeUndefined();
    expect(tryCall(undefined, "upcase")).toBeUndefined();
  });

  it("false try", () => {
    // false is not null/undefined — tryCall can still be called on it
    expect(tryCall(false as any, "nonexistent")).toBeUndefined();
  });

  it("try only block", () => {
    const obj = { val: 42 };
    expect(tryWith(obj, (o) => o.val)).toBe(42);
  });

  it("try only block bang", () => {
    const obj = { val: 99 };
    expect(tryWith(obj, (o) => o.val)).toBe(99);
  });

  it("try only block nil", () => {
    expect(tryWith(null, (o: any) => o.val)).toBeUndefined();
  });

  it("try with instance eval block", () => {
    const obj = { x: 10 };
    const result = tryWith(obj, function (o) {
      return o.x * 2;
    });
    expect(result).toBe(20);
  });

  it("try with instance eval block bang", () => {
    const obj = { x: 5 };
    const result = tryWith(obj, (o) => o.x + 1);
    expect(result).toBe(6);
  });

  it("try with private method bang", () => {
    const obj = { name: "Alice" };
    expect(() => tryBang(obj, "nonExistingPrivate")).toThrow();
  });

  it("try with private method", () => {
    const obj = { name: "Alice" };
    expect(tryCall(obj, "name")).toBe("Alice");
  });

  it("try with method on delegator", () => {
    const obj = {
      delegate: {
        value() {
          return 42;
        },
      },
    };
    expect(tryCall(obj.delegate, "value")).toBe(42);
  });

  it("try with method on delegator target", () => {
    const target = {
      info() {
        return "target";
      },
    };
    expect(tryCall(target, "info")).toBe("target");
  });

  it("try with overridden method on delegator", () => {
    const obj = {
      toString() {
        return "custom";
      },
    };
    expect(tryCall(obj, "toString")).toBe("custom");
  });

  it("try with private method on delegator", () => {
    const obj = {
      pub() {
        return "public";
      },
    };
    expect(tryCall(obj, "pub")).toBe("public");
    expect(tryCall(obj, "priv")).toBeUndefined();
  });

  it("try with private method on delegator bang", () => {
    const obj = {
      pub() {
        return "ok";
      },
    };
    expect(() => tryBang(obj, "priv")).toThrow();
  });

  it("try with private method on delegator target", () => {
    const target = {
      doIt() {
        return "done";
      },
    };
    expect(tryCall(target, "doIt")).toBe("done");
  });

  it("try with private method on delegator target bang", () => {
    const target = {};
    expect(() => tryBang(target, "missing")).toThrow();
  });
});
