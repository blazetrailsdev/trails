import { describe, it, expect } from "vitest";

import { NameError, Range } from "@blazetrails/ruby-compat";
import {
  MockExpectationError,
  assertCalled,
  assertCalledOnInstanceOf,
  assertCalledWith,
  assertNotCalledOnInstanceOf,
} from "./method-call-assertions.js";

describe("assertCalled with an async block", () => {
  it("restores the stub only after the block settles", async () => {
    const object = { foo: () => "original" };
    await assertCalled(object, "foo", null, { returns: "stubbed" }, async () => {
      await Promise.resolve();
      expect(object.foo()).toBe("stubbed");
    });
    expect(object.foo()).toBe("original");
  });

  it("fails when the async block does not call the method", async () => {
    const object = { foo: () => "original" };
    await expect(assertCalled(object, "foo", null, {}, async () => {})).rejects.toThrow(
      "Expected foo to be called 1 times, but was called 0 times",
    );
  });
});

describe("assertCalledWith", () => {
  it("rejects a call beyond the one expectation", () => {
    const object = { foo: (_x: number) => "original" };
    expect(() =>
      assertCalledWith(object, "foo", [1], {}, () => {
        object.foo(1);
        object.foo(1);
      }),
    ).toThrow("No more expects available for :foo: 1");
    expect(object.foo(1)).toBe("original");
  });

  it("compares arguments with Ruby ==", () => {
    const object = { foo: (_h: object) => "original" };
    assertCalledWith(object, "foo", [{ a: 1 }], {}, () => {
      object.foo(Object.assign(Object.create(null), { a: 1 }));
    });
  });

  it("matches an argument with Ruby ===", () => {
    const object = { foo: (_a: unknown, _b: unknown) => "original" };
    assertCalledWith(object, "foo", [/\d+/, Date], {}, () => {
      object.foo("id 42", new Date());
    });
    expect(() =>
      assertCalledWith(object, "foo", [/\d+/, Date], {}, () => {
        object.foo("none", {});
      }),
    ).toThrow(MockExpectationError);
  });

  it("matches an argument with a ported caseEquals", () => {
    const object = { foo: (_n: number) => "original" };
    assertCalledWith(object, "foo", [new Range(1, 5)], {}, () => {
      object.foo(3);
    });
    expect(() =>
      assertCalledWith(object, "foo", [new Range(1, 5)], {}, () => {
        object.foo(9);
      }),
    ).toThrow(MockExpectationError);
  });

  it("matches an argument with a lambda, as Proc#===", () => {
    const object = { foo: (_n: number) => "original" };
    assertCalledWith(object, "foo", [(n: number) => n > 2], {}, () => {
      object.foo(3);
    });
    expect(() =>
      assertCalledWith(object, "foo", [(n: number) => n > 2], {}, () => {
        object.foo(1);
      }),
    ).toThrow(MockExpectationError);
  });

  it("verifies after an async block settles", async () => {
    const object = { foo: (_x: number) => "original" };
    await expect(
      assertCalledWith(object, "foo", [1], {}, async () => {
        await Promise.resolve();
        object.foo(2);
      }),
    ).rejects.toThrow("Expected call with [1], got [2]");
  });
});

class Widget {
  build(): string {
    return "built";
  }
  get reader(): string {
    return "read";
  }
}

class SubWidget extends Widget {}

describe("assertCalledOnInstanceOf with an async block", () => {
  it("counts calls made after the block's first await", async () => {
    await assertCalledOnInstanceOf(Widget, "build", null, { times: 2 }, async () => {
      await Promise.resolve();
      new Widget().build();
      new Widget().build();
    });
  });

  it("rejects on a count mismatch", async () => {
    await expect(
      assertNotCalledOnInstanceOf(Widget, "build", "should not build", async () => {
        await Promise.resolve();
        new Widget().build();
      }),
    ).rejects.toThrow(
      /should not build\.\nExpected build to be called 0 times, but was called 1 times/,
    );
  });

  it("restores the prototype only after the block settles", async () => {
    await assertCalledOnInstanceOf(Widget, "build", null, { returns: "stubbed" }, async () => {
      await Promise.resolve();
      expect(new Widget().build()).toBe("stubbed");
    });
    expect(new Widget().build()).toBe("built");
    expect(Object.prototype.hasOwnProperty.call(Widget.prototype, "build")).toBe(true);
  });
});

describe("assertCalledOnInstanceOf on a subclass", () => {
  it("counts an inherited method called on the named class's instances", () => {
    assertCalledOnInstanceOf(SubWidget, "build", null, {}, () => {
      new SubWidget().build();
    });
    expect(Object.prototype.hasOwnProperty.call(SubWidget.prototype, "build")).toBe(false);
  });

  it("counts reads of an inherited reader", () => {
    assertCalledOnInstanceOf(SubWidget, "reader", null, { returns: "stubbed" }, () => {
      expect(new SubWidget().reader).toBe("stubbed");
    });
    expect(new SubWidget().reader).toBe("read");
  });

  it("raises NameError for an undefined method", () => {
    expect(() =>
      assertNotCalledOnInstanceOf(Widget, "nope" as keyof Widget & string, null, () => {}),
    ).toThrow(NameError);
  });
});
