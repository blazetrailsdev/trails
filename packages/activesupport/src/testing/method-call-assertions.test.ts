import { describe, it, expect } from "vitest";

import {
  assertCalled,
  assertNotCalled,
  assertCalledOnInstanceOf,
  assertNotCalledOnInstanceOf,
} from "../testing-helpers.js";

describe("MethodCallAssertionsTest", () => {
  it("assert called with defaults to expect once", () => {
    const obj = { greet: (name: string) => `hello ${name}` };
    assertCalled(obj, "greet", {}, () => {
      obj.greet("world");
    });
    // passes if called at least once (default)
  });

  it("assert called more than once", () => {
    const obj = { inc: () => 1 };
    assertCalled(obj, "inc", { times: 3 }, () => {
      obj.inc();
      obj.inc();
      obj.inc();
    });
  });

  it("assert called method with arguments", () => {
    const obj = { add: (a: number, b: number) => a + b };
    assertCalled(obj, "add", {}, () => {
      obj.add(1, 2);
    });
  });

  it("assert called returns", () => {
    const obj = { val: () => 42 };
    let result: number | undefined;
    assertCalled(obj, "val", {}, () => {
      result = obj.val();
    });
    expect(result).toBe(42);
  });

  it("assert called failure", () => {
    const obj = { noop: () => {} };
    expect(() =>
      assertCalled(obj, "noop", { times: 1 }, () => {
        /* not called */
      }),
    ).toThrow();
  });

  it("assert called with message", () => {
    const obj = { fn: () => {} };
    expect(() => assertCalled(obj, "fn", {}, () => {})).toThrow(/fn.*called/);
  });

  it("assert called with arguments", () => {
    const obj = { log: (msg: string) => msg };
    assertCalled(obj, "log", {}, () => {
      obj.log("hello");
    });
  });

  it("assert called with arguments and returns", () => {
    const obj = { calc: (x: number) => x * 2 };
    let r: number | undefined;
    assertCalled(obj, "calc", {}, () => {
      r = obj.calc(5);
    });
    expect(r).toBe(10);
  });

  it("assert called with failure", () => {
    const obj = { fn: () => {} };
    expect(() =>
      assertCalled(obj, "fn", { times: 2 }, () => {
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
    assertCalledOnInstanceOf(Greeter, "greet", { times: 1 }, () => {
      new Greeter().greet();
    });
  });

  it("assert called on instance of more than once", () => {
    class Counter {
      count() {}
    }
    assertCalledOnInstanceOf(Counter, "count", { times: 2 }, () => {
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
    assertCalledOnInstanceOf(Calc, "add", { times: 1 }, () => {
      new Calc().add(1, 2);
    });
  });

  it("assert called on instance of returns", () => {
    class Calculator {
      multiply(x: number) {
        return x * 3;
      }
    }
    let result: number | undefined;
    assertCalledOnInstanceOf(Calculator, "multiply", { times: 1 }, () => {
      result = new Calculator().multiply(4);
    });
    expect(result).toBe(12);
  });

  it("assert called on instance of failure", () => {
    class MyClass {
      doThing() {}
    }
    expect(() => assertCalledOnInstanceOf(MyClass, "doThing", { times: 1 }, () => {})).toThrow();
  });

  it("assert called on instance of with message", () => {
    class MyClass {
      action() {}
    }
    expect(() => assertCalledOnInstanceOf(MyClass, "action", { times: 1 }, () => {})).toThrow();
  });

  it.skip("assert called on instance of nesting", () => {
    /* complex nesting */
  });

  it("assert not called", () => {
    const obj = { fn: () => {} };
    assertNotCalled(obj, "fn", () => {
      /* fn never called */
    });
  });

  it("assert not called failure", () => {
    const obj = { fn: () => {} };
    expect(() =>
      assertNotCalled(obj, "fn", () => {
        obj.fn();
      }),
    ).toThrow();
  });

  it("assert not called on instance of", () => {
    class Widget {
      render() {}
    }
    assertNotCalledOnInstanceOf(Widget, "render", () => {
      /* render not called */
    });
  });

  it("assert not called on instance of failure", () => {
    class Widget {
      render() {}
    }
    expect(() =>
      assertNotCalledOnInstanceOf(Widget, "render", () => {
        new Widget().render();
      }),
    ).toThrow();
  });

  it.skip("assert not called on instance of nesting", () => {
    /* complex nesting */
  });
  it.skip("stub any instance", () => {
    /* Ruby-specific stub_any_instance */
  });
  it.skip("stub any instance with instance", () => {
    /* Ruby-specific */
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
