import { describe, expect, it } from "vitest";
import { tryBang, tryCall, tryWith } from "../../try.js";
import { assertNotRespondTo } from "../../testing/assertions.js";
import { Tryable, Delegator } from "./try.js";

class PrivateKlass {
  #privateMethod() {
    return "private method";
  }
  callPrivate() {
    return this.#privateMethod();
  }
}

class Decorator extends Delegator {
  delegatorMethod() {
    return "delegator method";
  }

  reverse() {
    return "overridden reverse";
  }

  #privateDelegatorMethod() {
    return "private delegator method";
  }

  callPrivate() {
    return this.#privateDelegatorMethod();
  }
}

const reverse = (s: string) => [...s].reverse().join("");

describe("ObjectTryTest", () => {
  const string = "Hello";
  const str = string as unknown as object;

  it("nonexisting method", () => {
    const method = "undefinedMethod";
    assertNotRespondTo(string, method);
    expect(tryCall(str, method)).toBeUndefined();
  });

  it("nonexisting method with arguments", () => {
    const method = "undefinedMethod";
    assertNotRespondTo(string, method);
    expect(tryCall(str, method, "llo", "y")).toBeUndefined();
  });

  it("nonexisting method bang", () => {
    const method = "undefinedMethod";
    assertNotRespondTo(string, method);
    expect(() => tryBang(str, method)).toThrow(TypeError);
  });

  it("nonexisting method with arguments bang", () => {
    const method = "undefinedMethod";
    assertNotRespondTo(string, method);
    expect(() => tryBang(str, method, "llo", "y")).toThrow(TypeError);
  });

  it("valid method", () => {
    expect(tryCall(str, "length")).toEqual(5);
  });

  it("argument forwarding", () => {
    expect(tryCall(str, "replace", "llo", "y")).toEqual("Hey");
  });

  it("block forwarding", () => {
    expect(tryCall(str, "replace", "llo", (_match: string) => "y")).toEqual("Hey");
  });

  it("nil to type", () => {
    expect(tryCall(null, "toString")).toBeUndefined();
    expect(tryCall(null, "valueOf")).toBeUndefined();
  });

  it("false try", () => {
    expect(tryCall(false as unknown as object, "toString")).toEqual("false");
  });

  it("try only block", () => {
    expect(tryWith(string, reverse)).toEqual(reverse(string));
  });

  it("try only block bang", () => {
    expect(tryWith(string, reverse)).toEqual(reverse(string));
  });

  it("try only block nil", () => {
    let ran = false;
    tryWith(null, () => {
      ran = true;
    });
    expect(ran).toEqual(false);
  });

  it("try with instance eval block", () => {
    expect(tryWith(string, (s) => reverse(s))).toEqual(reverse(string));
  });

  it("try with instance eval block bang", () => {
    expect(tryWith(string, (s) => reverse(s))).toEqual(reverse(string));
  });

  it("try with private method bang", () => {
    expect(() => tryBang(new PrivateKlass(), "privateMethod")).toThrow(TypeError);
  });

  it("try with private method", () => {
    expect(tryCall(new PrivateKlass(), "privateMethod")).toBeUndefined();
  });

  it("try with method on delegator", () => {
    expect(new Decorator(string).try("delegatorMethod")).toEqual("delegator method");
  });

  it("try with method on delegator target", () => {
    expect(new Decorator(string).try("length")).toEqual(5);
  });

  it("try with overridden method on delegator", () => {
    expect(new Decorator(string).try("reverse")).toEqual("overridden reverse");
  });

  it("try with private method on delegator", () => {
    expect(new Decorator(string).try("privateDelegatorMethod")).toBeUndefined();
  });

  it("try with private method on delegator bang", () => {
    expect(() => new Decorator(string).tryBang("privateDelegatorMethod")).toThrow(TypeError);
  });

  it("try with private method on delegator target", () => {
    expect(new Decorator(new PrivateKlass()).try("privateMethod")).toBeUndefined();
  });

  it("try with private method on delegator target bang", () => {
    expect(() => new Decorator(new PrivateKlass()).tryBang("privateMethod")).toThrow(TypeError);
  });
});

describe("Tryable namespace", () => {
  it("try calls method on object", () => {
    const obj = { greet: () => "hello" };
    expect(Tryable.try(obj, "greet")).toBe("hello");
  });

  it("try returns undefined for null", () => {
    expect(Tryable.try(null, "greet")).toBeUndefined();
    expect(Tryable.try(undefined, "greet")).toBeUndefined();
  });

  it("try returns undefined for missing method", () => {
    expect(Tryable.try({ name: "test" }, "greet")).toBeUndefined();
  });

  it("try passes arguments", () => {
    const obj = { add: (a: number, b: number) => a + b };
    expect(Tryable.try(obj, "add", 2, 3)).toBe(5);
  });

  it("tryBang throws for missing method with descriptive message", () => {
    expect(() => Tryable.tryBang({}, "greet")).toThrow(TypeError);
    expect(() => Tryable.tryBang({}, "greet")).toThrow(/undefined method 'greet'/);
  });

  it("tryBang returns undefined for null", () => {
    expect(Tryable.tryBang(null, "greet")).toBeUndefined();
  });
});

describe("Delegator", () => {
  it("tryBang reads a zero-arg reader on the delegate", () => {
    expect(new Decorator("Hello").tryBang("length")).toEqual(5);
  });

  it("try forwards to delegate", () => {
    const d = new Delegator({ greet: () => "hello" });
    expect(d.try("greet")).toBe("hello");
  });

  it("try returns undefined for null delegate", () => {
    const d = new Delegator(null);
    expect(d.try("greet")).toBeUndefined();
  });

  it("tryBang forwards to delegate", () => {
    const d = new Delegator({ greet: () => "hello" });
    expect(d.tryBang("greet")).toBe("hello");
  });

  it("tryBang throws for missing method on delegate", () => {
    const d = new Delegator({ name: "test" });
    expect(() => d.tryBang("greet")).toThrow(TypeError);
  });
});
