import { describe, it, expect } from "vitest";
import { assertNotCalledOnInstanceOf, assertCalledOnInstanceOf } from "./method-call-assertions.js";

class Widget {
  build(): string {
    return "built";
  }
  get reader(): string {
    return "read";
  }
}

class SubWidget extends Widget {}

describe("assertNotCalledOnInstanceOf", () => {
  it("passes when the method is not called", async () => {
    await assertNotCalledOnInstanceOf(Widget, "build", async () => {
      // no instance created
    });
  });

  it("throws when the method is called", async () => {
    await expect(
      assertNotCalledOnInstanceOf(Widget, "build", async () => {
        new Widget().build();
      }),
    ).rejects.toThrow(/build to be called 0 times, but was called 1 times/);
  });

  it("detects calls on subclass instances by spying the named class", async () => {
    await expect(
      assertNotCalledOnInstanceOf(SubWidget, "build", async () => {
        new SubWidget().build();
      }),
    ).rejects.toThrow(/build to be called 0 times, but was called 1 times/);
  });

  it("spies inherited getters and counts accesses", async () => {
    await expect(
      assertNotCalledOnInstanceOf(SubWidget, "reader", async () => {
        void new SubWidget().reader;
      }),
    ).rejects.toThrow(/reader to be called 0 times, but was called 1 times/);
  });

  it("prepends the optional message", async () => {
    await expect(
      assertNotCalledOnInstanceOf(
        Widget,
        "build",
        async () => {
          new Widget().build();
        },
        "should not build",
      ),
    ).rejects.toThrow(/should not build\./);
  });

  it("restores the prototype after the block", async () => {
    await assertNotCalledOnInstanceOf(Widget, "build", async () => {});
    expect(new Widget().build()).toBe("built");
    expect(Object.prototype.hasOwnProperty.call(Widget.prototype, "build")).toBe(true);
  });

  it("throws for an unknown member", async () => {
    await expect(assertNotCalledOnInstanceOf(Widget, "nope", async () => {})).rejects.toThrow(
      /no method or accessor named nope/,
    );
  });
});

describe("assertCalledOnInstanceOf", () => {
  it("passes when called the expected number of times", async () => {
    await assertCalledOnInstanceOf(
      Widget,
      "build",
      async () => {
        new Widget().build();
        new Widget().build();
      },
      { times: 2 },
    );
  });

  it("does not call the original implementation, returning the stub value", async () => {
    let result: unknown;
    await assertCalledOnInstanceOf(
      Widget,
      "build",
      async () => {
        result = new Widget().build();
      },
      { returns: "stubbed" },
    );
    expect(result).toBe("stubbed");
  });

  it("throws on a count mismatch", async () => {
    await expect(assertCalledOnInstanceOf(Widget, "build", async () => {})).rejects.toThrow(
      /to be called 1 times, but was called 0 times/,
    );
  });
});
