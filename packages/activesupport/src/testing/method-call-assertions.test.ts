import { describe, it, expect, beforeEach } from "vitest";

import { Assertion, assertChanges, assertPredicate, assertRaises } from "./assertions.js";
import {
  MockExpectationError,
  assertCalled,
  assertCalledWith,
  assertCalledOnInstanceOf,
  assertNotCalled,
  assertNotCalledOnInstanceOf,
  stubAnyInstance,
} from "./method-call-assertions.js";

describe("MethodCallAssertionsTest", () => {
  class Level {
    increment(): number {
      return 1;
    }
    decrement(): void {}
    // Ruby's `def <<(arg); end` — an operator method, which JS spells as an
    // ordinary property whose name is the operator.
    "<<"(_arg: unknown): void {}
  }

  let object: Level;

  beforeEach(() => {
    object = new Level();
  });

  it("assert called with defaults to expect once", () => {
    assertCalled(object, "increment", null, {}, () => {
      object.increment();
    });
  });

  it("assert called more than once", () => {
    assertCalled(object, "increment", null, { times: 2 }, () => {
      object.increment();
      object.increment();
    });
  });

  it("assert called method with arguments", () => {
    assertCalled(object, "<<", null, {}, () => {
      object["<<"](2);
    });
  });

  it("assert called returns", () => {
    assertCalled(object, "increment", null, { returns: 10 }, () => {
      expect(object.increment()).toBe(10);
    });

    expect(object.increment()).toBe(1);
  });

  it("assert called failure", async () => {
    const error = await assertRaises([Assertion], {}, () => {
      assertCalled(object, "increment", null, {}, () => {
        // Call nothing...
      });
    });

    expect(error.message).toBe(
      "Expected increment to be called 1 times, but was called 0 times.\nExpected: 1\n  Actual: 0",
    );
  });

  it("assert called with message", async () => {
    const error = await assertRaises([Assertion], {}, () => {
      assertCalled(object, "increment", "dang it", {}, () => {
        // Call nothing...
      });
    });

    expect(error.message).toMatch(/dang it.\nExpected increment/);
  });

  it("assert called with arguments", () => {
    assertCalledWith(object, "<<", [2], {}, () => {
      object["<<"](2);
    });
  });

  it("assert called with arguments and returns", () => {
    assertCalledWith(object, "<<", [2], { returns: 10 }, () => {
      expect(object["<<"](2)).toBe(10);
    });

    expect(object["<<"](2)).toBeUndefined();
  });

  it("assert called with failure", async () => {
    await assertRaises([MockExpectationError], {}, () => {
      assertCalledWith(object, "<<", [4567], {}, () => {
        object["<<"](2);
      });
    });
  });

  it("assert called on instance of with defaults to expect once", () => {
    assertCalledOnInstanceOf(Level, "increment", null, {}, () => {
      object.increment();
    });
  });

  it("assert called on instance of more than once", () => {
    assertCalledOnInstanceOf(Level, "increment", null, { times: 2 }, () => {
      object.increment();
      object.increment();
    });
  });

  it("assert called on instance of with arguments", () => {
    assertCalledOnInstanceOf(Level, "<<", null, {}, () => {
      object["<<"](2);
    });
  });

  it("assert called on instance of returns", () => {
    assertCalledOnInstanceOf(Level, "increment", null, { returns: 10 }, () => {
      expect(object.increment()).toBe(10);
    });

    expect(object.increment()).toBe(1);
  });

  it("assert called on instance of failure", async () => {
    const error = await assertRaises([Assertion], {}, () => {
      assertCalledOnInstanceOf(Level, "increment", null, {}, () => {
        // Call nothing...
      });
    });

    expect(error.message).toBe(
      "Expected increment to be called 1 times, but was called 0 times.\nExpected: 1\n  Actual: 0",
    );
  });

  it("assert called on instance of with message", async () => {
    const error = await assertRaises([Assertion], {}, () => {
      assertCalledOnInstanceOf(Level, "increment", "dang it", {}, () => {
        // Call nothing...
      });
    });

    expect(error.message).toMatch(/dang it.\nExpected increment/);
  });

  it("assert called on instance of nesting", () => {
    assertCalledOnInstanceOf(Level, "increment", null, { times: 3 }, () => {
      assertCalledOnInstanceOf(Level, "decrement", null, { times: 2 }, () => {
        object.increment();
        object.decrement();
        object.increment();
        object.decrement();
        object.increment();
      });
    });
  });

  it("assert not called", () => {
    assertNotCalled(object, "decrement", null, () => {
      object.increment();
    });
  });

  it("assert not called failure", async () => {
    const error = await assertRaises([Assertion], {}, () => {
      assertNotCalled(object, "increment", null, () => {
        object.increment();
      });
    });

    expect(error.message).toBe(
      "Expected increment to be called 0 times, but was called 1 times.\nExpected: 0\n  Actual: 1",
    );
  });

  it("assert not called on instance of", () => {
    assertNotCalledOnInstanceOf(Level, "decrement", null, () => {
      object.increment();
    });
  });

  it("assert not called on instance of failure", async () => {
    const error = await assertRaises([Assertion], {}, () => {
      assertNotCalledOnInstanceOf(Level, "increment", null, () => {
        object.increment();
      });
    });

    expect(error.message).toBe(
      "Expected increment to be called 0 times, but was called 1 times.\nExpected: 0\n  Actual: 1",
    );
  });

  it("assert not called on instance of nesting", () => {
    assertNotCalledOnInstanceOf(Level, "increment", null, () => {
      assertNotCalledOnInstanceOf(Level, "decrement", null, () => {
        // Call nothing...
      });
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
    let counter = 1;
    // Rails builds a `Minitest::Test` subclass that `include`s
    // `ActiveSupport::Testing::Assertions`, runs it, and asserts the result
    // passed. trails has no test-case runner to instantiate, so the "did it
    // pass" flag is the block completing without the assertion raising.
    const testResults = { passed: false };
    await assertChanges(
      () => counter,
      null,
      {},
      () => {
        counter = 2;
      },
    );
    testResults.passed = true;

    assertPredicate(testResults, (results) => results.passed);
  });
});
