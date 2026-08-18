import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { CurrentAttributes } from "./current-attributes.js";
import { assertSame } from "./testing/assertions.js";
import { zone, setZone } from "./time-zone-config.js";

describe("CurrentAttributesTest", () => {
  /** Rails' `Person = Struct.new(:id, :name, :time_zone)`. */
  class Person {
    constructor(
      public id: number,
      public name: string,
      public timeZone?: string,
    ) {}
  }

  class Session extends CurrentAttributes {
    static {
      this.attribute("current", "previous");
    }
    declare static current: number | null | undefined;
    declare static previous: number | null | undefined;
  }

  class Current extends CurrentAttributes {
    static {
      this.attribute("counterInteger", { default: 0 });
      this.attribute("counterCallable", { default: () => 0 });
      this.attribute("world", "account", "person", "request");

      this.beforeReset(function (this: Current) {
        Session.previous = this.person?.id;
      });

      this.resets(function () {
        Session.current = null;
      });

      this.resets(":clearTimeZone");
    }

    declare static counterInteger: number;
    declare static counterCallable: number;
    declare static world: string | undefined;
    declare static account: string | undefined;
    declare static person: Person | undefined;
    declare static request: string | undefined;

    /**
     * Rails' `delegate :time_zone, to: :person` — a Struct member is a method
     * on the Ruby side, so the delegator here reads the `Person#timeZone` field.
     * The tests reach this and `intro` through `Current.instance()` where Rails
     * reaches them off the class: those class-level delegators come from the
     * `method_added` hook (current_attributes.rb:186-193), which has no
     * TypeScript equivalent.
     */
    get timeZone(): string | undefined {
      return this.person?.timeZone;
    }

    /**
     * Rails' overrides call `super`, which is the generated writer
     * `attributes[:account] = value` (current_attributes.rb:120-133).
     * TypeScript has no `super` for a member the base class does not declare,
     * so these reach the same `attributes` hash the generated pair does.
     */
    get account(): string | undefined {
      return this.attributes["account"] as string | undefined;
    }
    set account(account: string | undefined) {
      this.attributes["account"] = account;
      this.person = new Person(1, `${account}'s person`);
    }

    get person(): Person | undefined {
      return this.attributes["person"] as Person | undefined;
    }
    set person(person: Person | undefined) {
      this.attributes["person"] = person;
      setZone(person?.timeZone ?? null);
      Session.current = person?.id;
    }

    setWorldAndAccount({ world, account }: { world: string; account: string }): void {
      this.world = world;
      this.account = account;
    }

    getWorldAndAccount(hash: Record<string, unknown>): Record<string, unknown> {
      hash["world"] = this.world;
      hash["account"] = this.account;
      return hash;
    }

    respondToTest(): void {}

    get request(): string | undefined {
      return `${this.attributes["request"] ?? ""} something`;
    }
    set request(request: string | undefined) {
      this.attributes["request"] = request;
    }

    intro(): string {
      return `${this.person?.name}, in ${this.timeZone}`;
    }

    private clearTimeZone(): void {
      setZone("UTC");
    }

    declare world: string | undefined;
    declare counterInteger: number;
    declare counterCallable: number;
  }

  /**
   * Mirrors `ActiveSupport::CurrentAttributes::TestHelper`, which resets every
   * CurrentAttributes instance around each test, plus the `before_setup` /
   * `after_teardown` hooks that restore `Time.zone`.
   */
  let originalTimeZone: ReturnType<typeof zone>;

  beforeEach(() => {
    originalTimeZone = zone();
    Current.reset();
    Session.reset();
  });

  afterEach(() => {
    Current.reset();
    Session.reset();
    setZone(originalTimeZone);
  });

  it("read and write attribute", () => {
    Current.world = "world/1";
    expect(Current.world).toBe("world/1");
  });

  it("read and write attribute with default value", () => {
    expect(Current.counterInteger).toBe(0);

    Current.counterInteger += 1;

    expect(Current.counterInteger).toBe(1);

    Current.reset();

    expect(Current.counterInteger).toBe(0);
  });

  it("read attribute with default callable", () => {
    expect(Current.counterCallable).toBe(0);

    Current.counterCallable += 1;

    expect(Current.counterCallable).toBe(1);

    Current.reset();

    expect(Current.counterCallable).toBe(0);
  });

  it("read overwritten attribute method", () => {
    Current.request = "request/1";
    expect(Current.request).toBe("request/1 something");
  });

  it("set attribute via overwritten method", () => {
    Current.account = "account/1";
    expect(Current.account).toBe("account/1");
    expect(Current.person!.name).toBe("account/1's person");
  });

  it("set auxiliary class via overwritten method", () => {
    Current.person = new Person(42, "David", "Central Time (US & Canada)");
    expect(zone()!.name).toBe("Central Time (US & Canada)");
    expect(Session.current).toBe(42);
  });

  it("resets auxiliary classes via callback", () => {
    Current.person = new Person(42, "David", "Central Time (US & Canada)");
    expect(zone()!.name).toBe("Central Time (US & Canada)");

    Current.reset();
    expect(zone()!.name).toBe("UTC");
    expect(Session.previous).toBe(42);
    expect(Session.current).toBeNull();
  });

  it("set auxiliary class based on current attributes via before callback", () => {
    Current.person = new Person(42, "David", "Central Time (US & Canada)");
    expect(Session.previous).toBeUndefined();
    expect(Session.current).toBe(42);

    Current.reset();
    expect(Session.previous).toBe(42);
    expect(Session.current).toBeNull();
  });

  it("set attribute only via scope", () => {
    Current.world = "world/1";

    Current.set({ world: "world/2" }, () => {
      expect(Current.world).toBe("world/2");
    });

    expect(Current.world).toBe("world/1");
  });

  it("set multiple attributes", () => {
    Current.world = "world/1";
    Current.account = "account/1";

    Current.set({ world: "world/2", account: "account/2" }, () => {
      expect(Current.world).toBe("world/2");
      expect(Current.account).toBe("account/2");
    });

    expect(Current.world).toBe("world/1");
    expect(Current.account).toBe("account/1");

    const hash = { world: "world/2", account: "account/2" };
    Current.set(hash, () => {
      expect(Current.world).toBe("world/2");
      expect(Current.account).toBe("account/2");
    });
  });

  it("using keyword arguments", () => {
    Current.instance().setWorldAndAccount({ world: "world/1", account: "account/1" });

    expect(Current.world).toBe("world/1");
    expect(Current.account).toBe("account/1");

    const hash: Record<string, unknown> = {};
    assertSame(hash, Current.instance().getWorldAndAccount(hash));
    expect(hash["world"]).toBe("world/1");
    expect(hash["account"]).toBe("account/1");
  });

  let testingTeardown = false;

  beforeEach(() => {
    testingTeardown = false;
  });

  afterEach(() => {
    if (testingTeardown) expect(Session.current).toBe(42);
  });

  it("accessing attributes in teardown", () => {
    Session.current = 42;
    testingTeardown = true;
  });

  it("delegation", () => {
    Current.person = new Person(42, "David", "Central Time (US & Canada)");
    expect(Current.instance().timeZone).toBe("Central Time (US & Canada)");
    expect(Current.instance().timeZone).toBe("Central Time (US & Canada)");
  });

  it("all methods forward to the instance", () => {
    Current.person = new Person(42, "David", "Central Time (US & Canada)");
    expect(Current.instance().intro()).toBe("David, in Central Time (US & Canada)");
    expect(Current.instance().intro()).toBe("David, in Central Time (US & Canada)");
  });

  it("respond_to? for methods that have not been called", () => {
    expect("respondToTest" in Current.instance()).toBe(true);
  });

  it("CurrentAttributes defaults do not leak between classes", () => {
    void class extends CurrentAttributes {
      static {
        this.attribute("counterInteger", { default: 100 });
      }
    };
    Current.reset();

    expect(Current.counterInteger).toBe(0);
  });

  it.skip("CurrentAttributes use fiber-local variables");
  it.skip("CurrentAttributes can use thread-local variables");

  it("CurrentAttributes doesn't populate #attributes when not using defaults", () => {
    expect(Current.instance().attributes).toEqual({ counterInteger: 0, counterCallable: 0 });
  });

  it("CurrentAttributes restricted attribute names", () => {
    expect(() => {
      class InvalidAttributeNames extends CurrentAttributes {
        static {
          this.attribute("reset", "foo", "set");
        }
      }
      void InvalidAttributeNames;
    }).toThrow(/Restricted attribute names: reset, set/);
  });

  it("method_added hook doesn't reach the instance. Fix for #54646", () => {
    class MyCurrent extends CurrentAttributes {
      static {
        this.attribute("bar", { default: {} });
      }
      foo(): void {}
    }
    expect((MyCurrent as unknown as { bar: unknown }).bar).toBeInstanceOf(Object);
  });
});
