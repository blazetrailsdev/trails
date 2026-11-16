import { describe, it, expect, beforeEach } from "vitest";

import { include } from "@blazetrails/ruby-compat/include";
import {
  Assertion,
  Assertions,
  assertPredicate,
  assertRaises,
  Test,
} from "../../lib/testing/assertions.js";
import {
  MockExpectationError,
  assertCalled,
  assertCalledWith,
  assertCalledOnInstanceOf,
  assertNotCalled,
  assertNotCalledOnInstanceOf,
  stubAnyInstance,
} from "../../lib/testing/method-call-assertions.js";

describe("MethodCallAssertionsTest", () => {
  class Level {
    increment(): number {
      return 1;
    }
    decrement(): void {}
    "<<"(_arg: unknown): void {}
  }

  let object: Level;

  beforeEach(() => {
    object = new Level();
  });

  it("assert called with defaults to expect once", async () => {
    await assertCalled(object, "increment", null, {}, () => {
      object.increment();
    });
  });

  it("assert called more than once", async () => {
    await assertCalled(object, "increment", null, { times: 2 }, () => {
      object.increment();
      object.increment();
    });
  });

  it("assert called method with arguments", async () => {
    await assertCalled(object, "<<", null, {}, () => {
      object["<<"](2);
    });
  });

  it("assert called returns", async () => {
    await assertCalled(object, "increment", null, { returns: 10 }, () => {
      expect(object.increment()).toBe(10);
    });

    expect(object.increment()).toBe(1);
  });

  it("assert called failure", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertCalled(object, "increment", null, {}, () => {});
    });

    expect(error.message).toBe(
      "Expected increment to be called 1 times, but was called 0 times.\nExpected: 1\n  Actual: 0",
    );
  });

  it("assert called with message", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertCalled(object, "increment", "dang it", {}, () => {});
    });

    expect(error.message).toMatch(/dang it.\nExpected increment/);
  });

  it("assert called with arguments", async () => {
    await assertCalledWith(object, "<<", [2], {}, () => {
      object["<<"](2);
    });
  });

  it("assert called with arguments and returns", async () => {
    await assertCalledWith(object, "<<", [2], { returns: 10 }, () => {
      expect(object["<<"](2)).toBe(10);
    });

    expect(object["<<"](2)).toBeUndefined();
  });

  it("assert called with failure", async () => {
    await assertRaises([MockExpectationError], {}, async () => {
      await assertCalledWith(object, "<<", [4567], {}, () => {
        object["<<"](2);
      });
    });
  });

  it("assert called on instance of with defaults to expect once", async () => {
    await assertCalledOnInstanceOf(Level, "increment", null, {}, () => {
      object.increment();
    });
  });

  it("assert called on instance of more than once", async () => {
    await assertCalledOnInstanceOf(Level, "increment", null, { times: 2 }, () => {
      object.increment();
      object.increment();
    });
  });

  it("assert called on instance of with arguments", async () => {
    await assertCalledOnInstanceOf(Level, "<<", null, {}, () => {
      object["<<"](2);
    });
  });

  it("assert called on instance of returns", async () => {
    await assertCalledOnInstanceOf(Level, "increment", null, { returns: 10 }, () => {
      expect(object.increment()).toBe(10);
    });

    expect(object.increment()).toBe(1);
  });

  it("assert called on instance of failure", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertCalledOnInstanceOf(Level, "increment", null, {}, () => {});
    });

    expect(error.message).toBe(
      "Expected increment to be called 1 times, but was called 0 times.\nExpected: 1\n  Actual: 0",
    );
  });

  it("assert called on instance of with message", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertCalledOnInstanceOf(Level, "increment", "dang it", {}, () => {});
    });

    expect(error.message).toMatch(/dang it.\nExpected increment/);
  });

  it("assert called on instance of nesting", async () => {
    await assertCalledOnInstanceOf(Level, "increment", null, { times: 3 }, async () => {
      await assertCalledOnInstanceOf(Level, "decrement", null, { times: 2 }, () => {
        object.increment();
        object.decrement();
        object.increment();
        object.decrement();
        object.increment();
      });
    });
  });

  it("assert not called", async () => {
    await assertNotCalled(object, "decrement", null, () => {
      object.increment();
    });
  });

  it("assert not called failure", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertNotCalled(object, "increment", null, () => {
        object.increment();
      });
    });

    expect(error.message).toBe(
      "Expected increment to be called 0 times, but was called 1 times.\nExpected: 0\n  Actual: 1",
    );
  });

  it("assert not called on instance of", async () => {
    await assertNotCalledOnInstanceOf(Level, "decrement", null, () => {
      object.increment();
    });
  });

  it("assert not called on instance of failure", async () => {
    const error = await assertRaises([Assertion], {}, async () => {
      await assertNotCalledOnInstanceOf(Level, "increment", null, () => {
        object.increment();
      });
    });

    expect(error.message).toBe(
      "Expected increment to be called 0 times, but was called 1 times.\nExpected: 0\n  Actual: 1",
    );
  });

  it("assert not called on instance of nesting", async () => {
    await assertNotCalledOnInstanceOf(Level, "increment", null, async () => {
      await assertNotCalledOnInstanceOf(Level, "decrement", null, () => {});
    });
  });

  it("stub any instance", () => {
    stubAnyInstance(Level, {}, (instance) => {
      expect((Level as unknown as { new: () => Level }).new()).toBe(instance);
    });
  });

  it("stub any instance with instance", () => {
    stubAnyInstance(Level, { instance: object }, (instance) => {
      expect(object).toBe(instance);
      expect((Level as unknown as { new: () => Level }).new()).toBe(instance);
    });
  });

  it("assert changes when assertions are included", async () => {
    const testUnitClass = class extends Test {
      async testAssertChanges(this: Test & typeof Assertions): Promise<void> {
        let counter = 1;
        await this.assertChanges(
          () => counter,
          null,
          {},
          () => {
            counter = 2;
          },
        );
      }
    };
    include(testUnitClass, Assertions);

    const testResults = await new testUnitClass("testAssertChanges").run();
    assertPredicate(testResults, (results) => results.isPassed());
  });
});
