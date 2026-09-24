import { describe, it, expect, beforeEach } from "vitest";
import { ArgumentError, NoMethodError } from "@blazetrails/ruby-compat";
import { delegate, delegateMissingTo } from "../module-ext.js";
import { DelegationError } from "../delegation.js";
import { registerConstant, unregisterConstant } from "../inflector.js";
import {
  assert,
  assertNot,
  assertNothingRaised,
  assertPredicate,
  assertRaise,
  assertRaises,
  assertRespondTo,
  assertNotRespondTo,
  assertNil,
} from "../testing/assertions.js";

class Somewhere {
  name: string | undefined;

  constructor(
    public street?: string,
    public city?: string,
  ) {}

  static country(block: () => unknown) {
    return block();
  }
}
registerConstant("Somewhere", Somewhere);

class Someone {
  static tableName() {
    return "some_table";
  }

  constructor(
    public name?: string | null,
    public place?: any,
  ) {}

  get class() {
    return this.constructor;
  }

  kwSend({ method }: { method: string }) {
    return (this as any)[method];
  }

  // eslint-disable-next-line no-unused-private-class-members
  #privateName() {
    return "Private";
  }
}
delegate.call(Someone.prototype, "street", "city", "toF", { to: "place" });
delegate.call(Someone.prototype, "name=", { to: "place", prefix: true });
delegate.call(Someone.prototype, "toUpperCase", { to: "place.city" });
delegate.call(Someone.prototype, "tableName", { to: "class" });
delegate.call(Someone.prototype, "tableName", { to: "class", prefix: true });
delegate.call(Someone.prototype, "country", { to: Somewhere });
delegate.call(Someone.prototype, "foo", { to: "place" });
delegate.call(Someone.prototype, "bar", { to: "place", allowNil: true });

class Invoice {
  constructor(public client: any) {}
}
delegate.call(Invoice.prototype, "street", "city", "name", { to: "client", prefix: true });
delegate.call(Invoice.prototype, "street", "city", "name", { to: "client", prefix: "customer" });

class Project {
  constructor(
    public description?: any,
    public person?: any,
  ) {}
}
delegate.call(Project.prototype, "name", { to: "person", allowNil: true });
delegate.call(Project.prototype, "toF", { to: "description", allowNil: true });

class Developer {
  constructor(public client: any) {}
}
delegate.call(Developer.prototype, "name", { to: "client", prefix: undefined });

class Tester {
  constructor(public client?: any) {}

  foo() {
    return 1;
  }
}
delegate.call(Tester.prototype, "name", { to: "client", prefix: false });

class Event {
  constructor(public case_: any) {}

  get case() {
    return this.case_;
  }
}
delegate.call(Event.prototype, "foo", { to: "case" });

class SideEffect {
  ints = [1, 2, 3];

  shift() {
    return this.ints.shift();
  }
}
delegate.call(SideEffect.prototype, "valueOf", { to: "shift", allowNil: true });
delegate.call(SideEffect.prototype, "toString", { to: "shift" });

class ExtraMissing {
  get extraMissing() {
    return 42;
  }
}

class DecoratedTester extends ExtraMissing {
  constructor(public client: any) {
    super();
  }

  callName() {
    return (this as any).name;
  }
}

class ParameterSet {
  "@params" = new Map([["foo", "bar"]]);
}
delegate.call(ParameterSet.prototype, "get", "set", { to: "@params" });

class Name {
  "@full_name": string;

  constructor(first: string, last: string) {
    this["@full_name"] = `${first} ${last}`;
  }
}
delegate.call(Name.prototype, "toUpperCase", { to: "@full_name" });

class ArityTester {
  static zero() {}
  static zero_with_block(bl?: unknown) {}
  static zero_with_implicit_block(block?: () => unknown) {
    return block?.();
  }
  static one(a: unknown) {}
  static one_with_block(a: unknown) {}
  static two(a: unknown, b: unknown) {}
  static opt(a: unknown, b: unknown, c: unknown, d: unknown = null) {}
  static kwargs(kw: { a: unknown; b: unknown }) {}
  static kwargs_with_block(kw: { a: unknown; b: unknown; c: unknown }, block?: unknown) {}
  static opt_kwargs(kw: { a: unknown; b?: unknown }) {}
  static opt_kwargs_with_block(
    kw: { a: unknown; b: unknown; c: unknown; d?: unknown },
    block?: unknown,
  ) {}
}
registerConstant("ModuleTest::ArityTester", ArityTester);

class ArityTesterModule {
  static zero() {}
}
registerConstant("ModuleTest::ArityTesterModule", ArityTesterModule);

class DecoratedReserved {
  constructor(public case_: any) {}

  get case() {
    return this.case_;
  }
}

describe("ModuleTest", () => {
  let david: Someone & Record<string, any>;

  beforeEach(() => {
    david = new Someone("David", new Somewhere("Paulina", "Chicago")) as Someone &
      Record<string, any>;
  });

  it("delegation to methods", () => {
    expect(david.street()).toEqual("Paulina");
    expect(david.city()).toEqual("Chicago");
  });

  it("delegation to assignment method", () => {
    david.place_name = "Fred";
    expect(david.place.name).toEqual("Fred");
  });

  it("delegation to index get method", () => {
    const params = new ParameterSet() as ParameterSet & Record<string, any>;
    expect(params.get("foo")).toEqual("bar");
  });

  it("delegation to index set method", () => {
    const params = new ParameterSet() as ParameterSet & Record<string, any>;
    params.set("foo", "baz");
    expect(params.get("foo")).toEqual("baz");
  });

  it("delegation down hierarchy", () => {
    expect(david.toUpperCase()).toEqual("CHICAGO");
  });

  it("delegation to instance variable", () => {
    const david = new Name("David", "Hansson") as Name & Record<string, any>;
    expect(david.toUpperCase()).toEqual("DAVID HANSSON");
  });

  it("delegation to class method", () => {
    expect(david.tableName()).toEqual("some_table");
    expect(david.class_tableName()).toEqual("some_table");
  });

  it("missing delegation target", async () => {
    await assertRaise([ArgumentError], {}, () => delegate.call(Tester.prototype, "nowhere"));
    await assertRaise([ArgumentError], {}, () =>
      delegate.call(Tester.prototype, "noplace", { tos: "hollywood" } as any),
    );
  });

  it("delegation target when prefix is true", async () => {
    class Name {}
    await assertNothingRaised(() =>
      delegate.call(Name.prototype, "go", { to: "you", prefix: true }),
    );
    await assertNothingRaised(() =>
      delegate.call(Name.prototype, "go", { to: "_you", prefix: true }),
    );
    await assertRaise([ArgumentError], {}, () =>
      delegate.call(Name.prototype, "go", { to: "You", prefix: true }),
    );
    await assertRaise([ArgumentError], {}, () =>
      delegate.call(Name.prototype, "go", { to: "@you", prefix: true }),
    );
  });

  it("delegation prefix", () => {
    const invoice = new Invoice(david) as Invoice & Record<string, any>;
    expect(invoice.client_name()).toEqual("David");
    expect(invoice.client_street()).toEqual("Paulina");
    expect(invoice.client_city()).toEqual("Chicago");
  });

  it("delegation custom prefix", () => {
    const invoice = new Invoice(david) as Invoice & Record<string, any>;
    expect(invoice.customer_name()).toEqual("David");
    expect(invoice.customer_street()).toEqual("Paulina");
    expect(invoice.customer_city()).toEqual("Chicago");
  });

  it("delegation prefix with nil or false", () => {
    expect((new Developer(david) as any).name()).toEqual("David");
    expect((new Tester(david) as any).name()).toEqual("David");
  });

  it("delegation prefix with instance variable", async () => {
    await assertRaise([ArgumentError], {}, () => {
      class C {}
      delegate.call(C.prototype, "name", "address", { to: "@client", prefix: true });
    });
  });

  it("delegation with implicit block", async () => {
    await assertNothingRaised(() => david.country(() => {}));
  });

  it("delegation with allow nil", () => {
    const rails = new Project("Rails", new Someone("David")) as Project & Record<string, any>;
    expect(rails.name()).toEqual("David");
  });

  it("delegation with allow nil and nil value", () => {
    const rails = new Project("Rails") as Project & Record<string, any>;
    expect(rails.name()).toBeUndefined();
  });

  it("delegation with allow nil and false value", async () => {
    const project = new Project(false, false) as Project & Record<string, any>;
    await assertRaise([NoMethodError], {}, () => project.name());
  });

  it("delegation with allow nil and invalid value", async () => {
    const rails = new Project("Rails", 42) as Project & Record<string, any>;
    await assertRaise([NoMethodError], {}, () => rails.name());
  });

  it("delegation with allow nil and nil value and prefix", () => {
    delegate.call(Project.prototype, "name", { to: "person", allowNil: true, prefix: true });
    const rails = new Project("Rails") as Project & Record<string, any>;
    expect(rails.person_name()).toBeUndefined();
  });

  it("delegation without allow nil and nil value", async () => {
    const david = new Someone("David") as Someone & Record<string, any>;
    await assertRaise([DelegationError], {}, () => david.street());
  });

  it("delegation to method that exists on nil", () => {
    const nilPerson = new Someone(null) as Someone & Record<string, any>;
    expect(nilPerson.toF()).toEqual(0.0);
  });

  it("delegation to method that exists on nil when allowing nil", () => {
    const nilProject = new Project(null) as Project & Record<string, any>;
    expect(nilProject.toF()).toEqual(0.0);
  });

  it("delegation does not raise error when removing singleton instance methods", async () => {
    class Parent {
      static parentMethod() {}
    }

    await assertNothingRaised(() => {
      class C extends Parent {}
      delegate.call(C, "parentMethod", { to: "superclass" });
    });
  });

  // BLOCKED: activesupport-delegate-private-and-ruby-method-semantics
  it.todo("delegation line number");

  // BLOCKED: activesupport-delegate-private-and-ruby-method-semantics
  it.todo("delegate line with nil");

  it("delegation exception backtrace", () => {
    const someone = new Someone("foo", "bar") as Someone & Record<string, any>;
    try {
      someone.foo();
    } catch (e) {
      const fileAndLine = "module.test.ts";
      assert(
        (e as Error).stack!.split("\n").some((a) => a.includes(fileAndLine)),
        `[${(e as Error).stack}] did not include [${fileAndLine}]`,
      );
    }
  });

  it("delegation exception backtrace with allow nil", () => {
    const someone = new Someone("foo", "bar") as Someone & Record<string, any>;
    try {
      someone.bar();
    } catch (e) {
      const fileAndLine = "module.test.ts";
      assert(
        (e as Error).stack!.split("\n").some((a) => a.includes(fileAndLine)),
        `[${(e as Error).stack}] did not include [${fileAndLine}]`,
      );
    }
  });

  it("delegation invokes the target exactly once", () => {
    const se = new SideEffect() as SideEffect & Record<string, any>;

    expect(se.valueOf()).toEqual(1);
    expect(se.ints).toEqual([2, 3]);

    expect(se.toString()).toEqual("2");
    expect(se.ints).toEqual([3]);
  });

  it("delegation doesnt mask nested no method error on nil receiver", () => {
    class Product {
      constructor(public name: string) {}
      get manufacturer(): { name: string } {
        return (null as unknown as { unknownMethod(): { name: string } }).unknownMethod();
      }
      get type(): { name: string } {
        return (null as unknown as { typeName(): { name: string } }).typeName();
      }
    }
    delegate.call(Product.prototype, "name", { to: "manufacturer", prefix: true });
    delegate.call(Product.prototype, "name", { to: "type", prefix: true });
    const product = new Product("Widget") as Product & {
      manufacturer_name(): string;
      type_name(): string;
    };

    expect(() => product.manufacturer_name()).toThrow(TypeError);

    expect(() => product.type_name()).toThrow(TypeError);
  });

  it("delegation with method arguments", () => {
    class Block {
      isHello() {
        return true;
      }
    }
    class HasBlock {
      constructor(public block: Block) {}
    }
    delegate.call(HasBlock.prototype, "isHello", { to: "block" });
    const hasBlock = new HasBlock(new Block()) as HasBlock & Record<string, any>;
    assertPredicate(hasBlock, (b) => b.isHello());
  });

  it("delegate missing to with method", () => {
    expect((delegateMissingTo(new DecoratedTester(david), "client") as any).name).toEqual("David");
  });

  it("delegate missing to calling on self", () => {
    expect(delegateMissingTo(new DecoratedTester(david), "client").callName()).toEqual("David");
  });

  it("delegate missing to with reserved methods", () => {
    expect((delegateMissingTo(new DecoratedReserved(david), "case") as any).name).toEqual("David");
  });

  it("delegate missing to with keyword methods", () => {
    expect(
      (delegateMissingTo(new DecoratedReserved(david), "case") as any).kwSend({ method: "name" }),
    ).toEqual("David");
  });

  it("delegate missing to does not delegate to private methods", async () => {
    const e = await assertRaises([NoMethodError], {}, () =>
      (delegateMissingTo(new DecoratedReserved(david), "case") as any).privateName(),
    );

    expect(e.message).toMatch(/undefined method [`']privateName' for/);
  });

  it("delegate missing to does not delegate to fake methods", async () => {
    const e = await assertRaises([NoMethodError], {}, () =>
      (delegateMissingTo(new DecoratedReserved(david), "case") as any).myFakeMethod(),
    );

    expect(e.message).toMatch(/undefined method [`']myFakeMethod' for/);
  });

  it("delegate missing to raises delegation error if target nil", async () => {
    const e = await assertRaises(
      [DelegationError],
      {},
      () => (delegateMissingTo(new DecoratedTester(null), "client") as any).name,
    );

    expect(e.message).toEqual("name delegated to client, but client is nil");
  });

  it("delegate missing to returns nil if allow nil and nil target", () => {
    expect(
      (delegateMissingTo(new DecoratedReserved(null), "case", { allowNil: true }) as any).name,
    ).toBeUndefined();
  });

  it("delegate missing with allow nil when called on self", () => {
    class DecoratedMissingAllowNil {
      constructor(public case_: any) {}

      get case() {
        return this.case_;
      }

      callName() {
        return (this as any).name;
      }
    }
    expect(
      (
        delegateMissingTo(new DecoratedMissingAllowNil(null), "case", {
          allowNil: true,
        }) as any
      ).callName(),
    ).toBeUndefined();
  });

  it("delegate missing to affects respond to", () => {
    const decorated = () => delegateMissingTo(new DecoratedTester(david), "client");
    assertRespondTo(decorated(), "name");
    assertNotRespondTo(decorated(), "privateName");
    assertNotRespondTo(decorated(), "myFakeMethod");

    assert("name" in decorated());
    assertNot("privateName" in decorated());
    assertNot("myFakeMethod" in decorated());
  });

  it("delegate missing to respects superclass missing", () => {
    expect((delegateMissingTo(new DecoratedTester(david), "client") as any).extraMissing).toEqual(
      42,
    );

    assertRespondTo(delegateMissingTo(new DecoratedTester(david), "client"), "extraMissing");
  });

  it("delegate missing to does not interfere with marshallization", () => {
    class Maze {
      cavern: any;
      passages: any;
    }
    class Cavern {
      constructor(public maze: Maze) {}

      get target() {
        return (this.maze.passages = "twisty");
      }
    }
    const maze = new Maze();
    maze.cavern = delegateMissingTo(new Cavern(new Maze()), "target");

    const array = [maze, null];
    const serializedArray = JSON.stringify(array);
    const deserializedArray = JSON.parse(serializedArray);

    assertNil(deserializedArray[1]);
  });

  it("delegate with case", () => {
    const event = new Event(new Tester()) as Event & Record<string, any>;
    expect(event.foo()).toEqual(1);
  });

  it.skip("private delegate", () => {
    // BLOCKED: activesupport-delegate-private-and-ruby-method-semantics
    class Location {
      "@place": Somewhere;
      constructor(place: Somewhere) {
        this["@place"] = place;
      }
    }
    delegate.call(Location.prototype, "street", "city", { to: "@place", private: true } as any);

    const place = new Location(new Somewhere("Such street", "Sad city"));

    assertNotRespondTo(place, "street");
    assertNotRespondTo(place, "city");

    assert("street" in place);
    assert("city" in place);
  });

  it.skip("private delegate prefixed", () => {
    // BLOCKED: activesupport-delegate-private-and-ruby-method-semantics
    class Location {
      "@place": Somewhere;
      constructor(place: Somewhere) {
        this["@place"] = place;
      }
    }
    delegate.call(Location.prototype, "street", "city", {
      to: "@place",
      prefix: "the",
      private: true,
    } as any);

    const place = new Location(new Somewhere("Such street", "Sad city"));

    assertNotRespondTo(place, "street");
    assertNotRespondTo(place, "city");

    assertNotRespondTo(place, "the_street");
    assert("the_street" in place);
    assertNotRespondTo(place, "the_city");
    assert("the_city" in place);
  });

  it.skip("private delegate with private option", () => {
    // BLOCKED: activesupport-delegate-private-and-ruby-method-semantics
    class Location {
      "@place": Somewhere;
      constructor(place: Somewhere) {
        this["@place"] = place;
      }
    }
    delegate.call(Location.prototype, "street", "city", { to: "@place", private: true } as any);

    const place = new Location(new Somewhere("Such street", "Sad city"));

    assertNotRespondTo(place, "street");
    assertNotRespondTo(place, "city");

    assert("street" in place);
    assert("city" in place);
  });

  it.skip("some public some private delegate with private option", () => {
    // BLOCKED: activesupport-delegate-private-and-ruby-method-semantics
    class Location {
      "@place": Somewhere;
      constructor(place: Somewhere) {
        this["@place"] = place;
      }
    }
    delegate.call(Location.prototype, "street", { to: "@place" });
    delegate.call(Location.prototype, "city", { to: "@place", private: true } as any);

    const place = new Location(new Somewhere("Such street", "Sad city"));

    assertRespondTo(place, "street");
    assertNotRespondTo(place, "city");

    assert("city" in place);
  });

  it.skip("private delegate prefixed with private option", () => {
    // BLOCKED: activesupport-delegate-private-and-ruby-method-semantics
    class Location {
      "@place": Somewhere;
      constructor(place: Somewhere) {
        this["@place"] = place;
      }
    }
    delegate.call(Location.prototype, "street", "city", {
      to: "@place",
      prefix: "the",
      private: true,
    } as any);

    const place = new Location(new Somewhere("Such street", "Sad city"));

    assertNotRespondTo(place, "the_street");
    assert("the_street" in place);
    assertNotRespondTo(place, "the_city");
    assert("the_city" in place);
  });

  it("delegate with private option returns names of delegate methods", () => {
    class Location {}

    expect(delegate.call(Location.prototype, "street", "city", { to: "@place" })).toEqual([
      "street",
      "city",
    ]);

    expect(
      delegate.call(Location.prototype, "street", "city", { to: "@place", prefix: "the" }),
    ).toEqual(["the_street", "the_city"]);
  });

  it("module nesting is empty", () => {
    class Json {
      static parse(source: string) {
        return JSON.parse(source);
      }
    }
    registerConstant("Admin::Json", Json);
    try {
      class C {}
      delegate.call(C, "parse", { to: Json });
      const c = C as typeof C & { parse(source: string): unknown };
      expect(c.parse("[1]")).toEqual([1]);
    } finally {
      unregisterConstant("Admin::Json", Json);
    }
  });

  it("delegation unreacheable module", async () => {
    const anonymousClass = [class {}][0];
    let error = await assertRaises([ArgumentError], {}, () => {
      class C {}
      delegate.call(C.prototype, "something", { to: anonymousClass });
    });
    expect(error.message).toContain("Can't delegate to anonymous class or module");

    Object.defineProperty(anonymousClass, "name", { value: "FakeName" });
    error = await assertRaises([ArgumentError], {}, () => {
      class C {}
      delegate.call(C.prototype, "something", { to: anonymousClass });
    });
    expect(error.message).toContain("Can't delegate to detached class or module: FakeName");
  });

  it("delegation arity to module", async () => {
    class C {}
    delegate.call(C.prototype, "zero", "one", "two", { to: ArityTester });
    expect((C.prototype as any).zero.length).toEqual(0);
    expect((C.prototype as any).one.length).toEqual(1);
    expect((C.prototype as any).two.length).toEqual(2);

    class E {}
    delegate.call(E.prototype, "zero", { to: ArityTesterModule });

    expect((E.prototype as any).zero.length).toEqual(0);
    await assertNothingRaised(() => (new E() as any).zero());
  });

  it.skip("delegation arity to self class", async () => {
    // BLOCKED: activesupport-delegate-private-and-ruby-method-semantics
    class D extends ArityTester {}
    delegate.call(
      D.prototype,
      "zero",
      "zero_with_block",
      "zero_with_implicit_block",
      "one",
      "one_with_block",
      "two",
      "opt",
      "kwargs",
      "kwargs_with_block",
      "opt_kwargs",
      "opt_kwargs_with_block",
      { to: "class" },
    );
    Object.defineProperty(D.prototype, "class", {
      get(this: object) {
        return this.constructor;
      },
    });

    const proto = D.prototype as any;
    expect(proto.zero.length).toEqual(0);
    expect(proto.zero_with_block.length).toEqual(0);
    expect(proto.zero_with_implicit_block.length).toEqual(0);
    expect(proto.one.length).toEqual(1);
    expect(proto.one_with_block.length).toEqual(1);
    expect(proto.two.length).toEqual(2);
    expect(proto.opt.length).toEqual(-1);
    expect(proto.kwargs.length).toEqual(-1);
    expect(proto.kwargs_with_block.length).toEqual(-1);
    expect(proto.opt_kwargs.length).toEqual(-1);
    expect(proto.opt_kwargs_with_block.length).toEqual(-1);
    await assertNothingRaised(() => {
      const d = new D() as any;
      d.zero();
      d.zero_with_block();
      d.zero_with_implicit_block(() => {});
      d.one(1);
      d.one_with_block(1);
      d.two(1, 2);
      d.opt(1, 2, 3);
      d.kwargs({ a: 1, b: 2 });
      d.kwargs_with_block({ a: 1, b: 2, c: 3 });
      d.opt_kwargs({ a: 1 });
      d.opt_kwargs_with_block({ a: 1, b: 2, c: 3 });
    });
  });
});
