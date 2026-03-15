import { describe, expect, it } from "vitest";
import { concern, hasConcern, includeConcern } from "../../concern.js";

describe("ModuleConcerningTest", () => {
  it("concerning declares a concern and includes it immediately", () => {
    // In Rails, Module#concerning is sugar for defining+including a concern
    const Host: Record<string, unknown> = {};
    const FooConcern = concern({ classMethods: { foo: () => "foo" } });
    includeConcern(Host, FooConcern);
    expect(hasConcern(Host, FooConcern)).toBe(true);
    expect((Host.foo as () => string)()).toBe("foo");
  });

  it("concerning can prepend concern", () => {
    const Host: Record<string, unknown> = { greet: () => "original" };
    const Override = concern({
      included(base: Record<string, unknown>) {
        const orig = base.greet as () => string;
        base.greet = () => `${orig()} world`;
      },
    });
    includeConcern(Host, Override);
    expect((Host.greet as () => string)()).toBe("original world");
  });
});

describe("ModuleConcernTest", () => {
  it("concern creates a module extended with active support concern", () => {
    const Greetable = concern({
      classMethods: { greet: () => "hello" },
    });
    expect(typeof Greetable).toBe("object");
    expect(Greetable.__concern).toBe(true);
    const Host: Record<string, unknown> = {};
    includeConcern(Host, Greetable);
    expect(typeof Host.greet).toBe("function");
    expect((Host.greet as () => string)()).toBe("hello");
  });

  it("using class methods blocks instead of ClassMethods module", () => {
    const Trackable = concern({
      classMethods: {
        track(event: string) {
          return `tracked: ${event}`;
        },
      },
    });
    const Host: Record<string, unknown> = {};
    includeConcern(Host, Trackable);
    expect((Host.track as (e: string) => string)("click")).toBe("tracked: click");
  });

  it("using class methods blocks instead of ClassMethods module prepend", () => {
    const Serializable = concern({
      classMethods: {
        serialize() {
          return "{}";
        },
      },
    });
    const Host: Record<string, unknown> = {};
    includeConcern(Host, Serializable);
    expect((Host.serialize as () => string)()).toBe("{}");
  });
});
