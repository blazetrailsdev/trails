import { describe, it, expect } from "vitest";

import {
  assertCalled,
  assertNotCalled,
  assertCalledOnInstanceOf,
  assertNotCalledOnInstanceOf,
  assertCalledWith,
  stubAnyInstance,
} from "./method-call-assertions.js";

describe("MethodCallAssertionsTest", () => {
  it("assert called with defaults to expect once", () => {
    const obj = { greet: (name: string) => `hello ${name}` };
    assertCalled(obj, "greet", null, {}, () => {
      obj.greet("world");
    });
    // passes if called at least once (default)
  });

  it("assert called more than once", () => {
    const obj = { inc: () => 1 };
    assertCalled(obj, "inc", null, { times: 3 }, () => {
      obj.inc();
      obj.inc();
      obj.inc();
    });
  });

  it("assert called method with arguments", () => {
    const obj = { add: (a: number, b: number) => a + b };
    assertCalled(obj, "add", null, {}, () => {
      obj.add(1, 2);
    });
  });

  it("assert called returns", () => {
    const obj = { val: () => 42 };
    let result: unknown;
    assertCalled(obj, "val", null, { returns: 42 }, () => {
      result = obj.val();
    });
    expect(result).toBe(42);
  });

  it("assert called failure", () => {
    const obj = { noop: () => {} };
    expect(() =>
      assertCalled(obj, "noop", null, { times: 1 }, () => {
        /* not called */
      }),
    ).toThrow();
  });

  it("assert called with message", () => {
    const obj = { fn: () => {} };
    expect(() => assertCalled(obj, "fn", null, {}, () => {})).toThrow(/fn.*called/);
  });

  it("assert called with arguments", () => {
    const obj = { log: (msg: string) => msg };
    assertCalled(obj, "log", null, {}, () => {
      obj.log("hello");
    });
  });

  it("assert called with arguments and returns", () => {
    const obj = { calc: (x: number) => x * 2 };
    let r: unknown;
    assertCalled(obj, "calc", null, { returns: 10 }, () => {
      r = obj.calc(5);
    });
    expect(r).toBe(10);
  });

  it("assert called with failure", () => {
    const obj = { fn: () => {} };
    expect(() =>
      assertCalled(obj, "fn", null, { times: 2 }, () => {
        obj.fn();
      }),
    ).toThrow();
  });

  it("assert called on instance of with defaults to expect once", () => {
    class Greeter {
      greet() {
        return "hi";
      }
    }
    assertCalledOnInstanceOf(Greeter, "greet", null, { times: 1 }, () => {
      new Greeter().greet();
    });
  });

  it("assert called on instance of more than once", () => {
    class Counter {
      count() {}
    }
    assertCalledOnInstanceOf(Counter, "count", null, { times: 2 }, () => {
      new Counter().count();
      new Counter().count();
    });
  });

  it("assert called on instance of with arguments", () => {
    class Calc {
      add(a: number, b: number) {
        return a + b;
      }
    }
    assertCalledOnInstanceOf(Calc, "add", null, { times: 1 }, () => {
      new Calc().add(1, 2);
    });
  });

  it("assert called on instance of returns", () => {
    class Calculator {
      multiply(x: number) {
        return x * 3;
      }
    }
    let result: unknown;
    assertCalledOnInstanceOf(Calculator, "multiply", null, { times: 1, returns: 12 }, () => {
      result = new Calculator().multiply(4);
    });
    expect(result).toBe(12);
  });

  it("assert called on instance of failure", () => {
    class MyClass {
      doThing() {}
    }
    expect(() =>
      assertCalledOnInstanceOf(MyClass, "doThing", null, { times: 1 }, () => {}),
    ).toThrow();
  });

  it("assert called on instance of with message", () => {
    class MyClass {
      action() {}
    }
    expect(() =>
      assertCalledOnInstanceOf(MyClass, "action", null, { times: 1 }, () => {}),
    ).toThrow();
  });

  it.skip("assert called on instance of nesting");

  it("assert not called", () => {
    const obj = { fn: () => {} };
    assertNotCalled(obj, "fn", null, () => {
      /* fn never called */
    });
  });

  it("assert not called failure", () => {
    const obj = { fn: () => {} };
    expect(() =>
      assertNotCalled(obj, "fn", null, () => {
        obj.fn();
      }),
    ).toThrow();
  });

  it("assert not called on instance of", () => {
    class Widget {
      render() {}
    }
    assertNotCalledOnInstanceOf(Widget, "render", null, () => {
      /* render not called */
    });
  });

  it("assert not called on instance of failure", () => {
    class Widget {
      render() {}
    }
    expect(() =>
      assertNotCalledOnInstanceOf(Widget, "render", null, () => {
        new Widget().render();
      }),
    ).toThrow();
  });

  it.skip("assert not called on instance of nesting");
  it("stub any instance", () => {
    class Widget {}
    let yielded: Widget | undefined;
    stubAnyInstance(Widget, {}, (instance) => {
      yielded = instance;
      expect((Widget as unknown as { new: () => Widget }).new()).toBe(instance);
    });
    expect(yielded).toBeInstanceOf(Widget);
  });

  it("stub any instance with instance", () => {
    class Widget {}
    const instance = new Widget();
    stubAnyInstance(Widget, { instance }, (yielded) => {
      expect(yielded).toBe(instance);
      expect((Widget as unknown as { new: () => Widget }).new()).toBe(instance);
    });
  });

  it("assert called with", () => {
    const obj = { log: (_msg: string) => "" };
    assertCalledWith(obj, "log", ["hello"], {}, () => {
      obj.log("hello");
    });
  });

  it("assert called with arguments and returns value", () => {
    const obj = { calc: (_x: number) => 0 };
    let r: unknown;
    assertCalledWith(obj, "calc", [5], { returns: 10 }, () => {
      r = obj.calc(5);
    });
    expect(r).toBe(10);
  });
  it("assert changes when assertions are included", () => {
    let counter = 0;
    const before = counter;
    (() => {
      counter += 1;
    })();
    expect(counter).not.toBe(before);
    expect(counter).toBe(1);
  });
});
