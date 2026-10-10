import { describe, it, expect, expectTypeOf } from "vitest";
import * as EnsureNamespace from "./ensure.js";
import { NameError } from "./name-error.js";
import { rbModConstGet, registerConstant, unregisterConstant } from "./variable.js";
import { Hash } from "./hash.js";
import {
  rbCBasicObject,
  rbClassSuperclass,
  rbObjClass,
  rbObjIvarGet,
  rbObjIvarSet,
  rbModName,
  rbModToS,
  rbObjSingletonClass,
} from "./object.js";
import {
  include,
  rbModConstDefined,
  rbModConstSet,
  prepend,
  extend,
  included,
  extended,
  rbObjClone,
  rbObjDup,
  Kernel,
  Module,
  initialize,
  initializeIncludedModules,
  isModuleIncluded,
  rbModAncestors,
  defineModule,
  moduleVisibility,
  publicInstanceMethods,
  type ModuleVisibility,
  type Included,
  type Initialized,
  type Extended,
} from "./include.js";

type DynMethods = Record<string, (...args: unknown[]) => unknown>;
type DynProps = Record<string, unknown>;
type DynSymbols = Record<symbol, unknown>;

describe("initializeIncludedModules", () => {
  it("runs a generator initializer's code before its yield ahead of the initializers beneath it", () => {
    const calls: string[] = [];
    const Inner = new Module();
    (Inner as unknown as Record<symbol, unknown>)[initialize] = function () {
      calls.push("inner");
    };
    const Outer = new Module();
    (Outer as unknown as Record<symbol, unknown>)[initialize] = function* (name: string) {
      calls.push(`before ${name}`);
      yield;
      calls.push(`after ${name}`);
    };
    class Root {
      constructor(...args: unknown[]) {
        initializeIncludedModules(this, ...args);
      }
    }
    include(Root, Inner);
    class Sub extends Root {}
    include(Sub, Outer);

    new Sub("x");
    expect(calls).toEqual(["before x", "inner", "after x"]);
  });

  it("closes a generator initializer when an initializer beneath it raises", () => {
    const calls: string[] = [];
    const Inner = new Module();
    (Inner as unknown as Record<symbol, unknown>)[initialize] = function () {
      throw new TypeError("inner");
    };
    const Outer = new Module();
    (Outer as unknown as Record<symbol, unknown>)[initialize] = function* () {
      try {
        yield;
        calls.push("after");
      } finally {
        calls.push("ensure");
      }
    };
    class Root {
      constructor() {
        initializeIncludedModules(this);
      }
    }
    include(Root, Inner);
    class Sub extends Root {}
    include(Sub, Outer);

    expect(() => new Sub()).toThrow(TypeError);
    expect(calls).toEqual(["ensure"]);
  });

  it("raises for a generator initializer that yields a second time", () => {
    const Twice = new Module();
    (Twice as unknown as Record<symbol, unknown>)[initialize] = function* () {
      yield;
      yield;
    };
    class Root {
      constructor() {
        initializeIncludedModules(this);
      }
    }
    include(Root, Twice);

    expect(() => new Root()).toThrow(/yields once/);
  });

  it("wraps the includer's construction in a class module's generator initializer", () => {
    const calls: string[] = [];
    class Root {
      seen: unknown;
      constructor(kwargs: Record<string, unknown> = {}) {
        initializeIncludedModules(this);
        this.seen = kwargs;
        calls.push("root");
      }
    }
    class Zoned {
      declare zone?: string;
      static *[initialize](
        this: Zoned,
        { zone, ...kwargs }: { zone?: string; limit?: number } = {},
      ): Generator<[typeof kwargs]> {
        yield [kwargs];
        calls.push("zoned");
        this.zone = zone;
      }
    }
    class Sub extends (Root as Initialized<typeof Root, typeof Zoned>) {}
    include(Sub, Zoned);

    const sub = new Sub({ zone: "utc", limit: 3 });
    expect(calls).toEqual(["root", "zoned"]);
    expect(sub.seen).toEqual({ limit: 3 });
    expect((sub as unknown as Zoned).zone).toBe("utc");
    expect(sub).toBeInstanceOf(Root);
    expect(rbClassSuperclass(Sub)).toBe(Root);
    expect(Object.getPrototypeOf(new (class extends Sub {})())).toBeInstanceOf(Sub);
  });

  it("forwards its own arguments when a spliced generator initializer yields none", () => {
    class Root {
      constructor(public a?: number) {}
    }
    class Bare {
      declare after?: boolean;
      static *[initialize](this: Bare): Generator {
        yield;
        this.after = true;
      }
    }
    class Sub extends Root {}
    include(Sub, Bare);

    const sub = new Sub(4);
    expect(sub.a).toBe(4);
    expect((sub as unknown as Bare).after).toBe(true);
  });

  it("runs a spliced generator initializer against the instance itself", () => {
    const seen: object[] = [];
    class Root {}
    class Seated {
      static *[initialize](this: Seated): Generator {
        yield;
        seen.push(this);
        rbObjIvarSet(this, "@seat", 1);
        Object.defineProperty(this, "defined", { value: 2, enumerable: true });
      }
    }
    class Sub extends Root {}
    include(Sub, Seated);

    const sub = new Sub();
    expect(seen).toEqual([sub]);
    expect(seen[0]).toBe(sub);
    expect(rbObjIvarGet(sub, "@seat")).toBe(1);
    expect(Object.keys(sub)).toContain("defined");
  });

  it("leaves the code after a spliced initializer's yield unrun when the superclass constructor raises", () => {
    const calls: string[] = [];
    class Root {
      constructor() {
        throw new TypeError("root");
      }
    }
    class After {
      static *[initialize](): Generator {
        yield;
        calls.push("after");
      }
    }
    class Sub extends Root {}
    include(Sub, After);

    expect(() => new Sub()).toThrow(TypeError);
    expect(calls).toEqual([]);
  });

  it("seats a module's per-instance state as an own property at construction", () => {
    class Controller {
      constructor() {
        initializeIncludedModules(this);
      }
    }
    const mod = {
      [initialize](this: DynProps) {
        this.dbRuntime = null;
      },
    };
    include(Controller, mod);

    const controller = new Controller();
    expect(Object.hasOwn(controller, "dbRuntime")).toBe(true);
    expect((controller as DynProps).dbRuntime).toBe(null);
  });

  it("runs the initializers of every included module, in include order", () => {
    const order: string[] = [];
    class Controller {
      constructor() {
        initializeIncludedModules(this);
      }
    }
    include(Controller, { [initialize]: () => order.push("first") });
    include(Controller, { [initialize]: () => order.push("second") });

    new Controller();
    expect(order).toEqual(["first", "second"]);
  });

  it("does not re-register the initializer of an already-included module", () => {
    let seatings = 0;
    class Controller {
      constructor() {
        initializeIncludedModules(this);
      }
    }
    const mod = { [initialize]: () => void seatings++ };
    include(Controller, mod);
    include(Controller, mod);

    new Controller();
    expect(seatings).toBe(1);
  });

  it("does not re-register a module a superclass already included", () => {
    let seatings = 0;
    class Base {
      constructor() {
        initializeIncludedModules(this);
      }
    }
    const mod = { [initialize]: () => void seatings++ };
    include(Base, mod);
    class Sub extends Base {}
    include(Sub, mod);

    new Sub();
    expect(seatings).toBe(1);
  });

  it("runs the initializers a superclass included", () => {
    class Base {
      constructor() {
        initializeIncludedModules(this);
      }
    }
    include(Base, {
      [initialize](this: DynProps) {
        this.seated = true;
      },
    });
    class Sub extends Base {}

    expect(Object.hasOwn(new Sub(), "seated")).toBe(true);
  });

  it("seats a prepended module's per-instance state as an own property", () => {
    class Controller {
      constructor() {
        initializeIncludedModules(this);
      }
    }
    prepend(Controller, {
      [initialize](this: DynProps) {
        this.dbRuntime = null;
      },
    });

    const controller = new Controller();
    expect(Object.hasOwn(controller, "dbRuntime")).toBe(true);
    expect((controller as DynProps).dbRuntime).toBe(null);
  });

  it("runs a prepended module's initializer after those of included modules", () => {
    const order: string[] = [];
    class Controller {
      constructor() {
        initializeIncludedModules(this);
      }
    }
    prepend(Controller, { [initialize]: () => order.push("prepended") });
    include(Controller, { [initialize]: () => order.push("included") });

    new Controller();
    expect(order).toEqual(["included", "prepended"]);
  });

  it("does not re-register the initializer of an already-prepended module", () => {
    let seatings = 0;
    class Base {
      constructor() {
        initializeIncludedModules(this);
      }
    }
    const mod = { [initialize]: () => void seatings++ };
    prepend(Base, mod);
    prepend(Base, mod);
    class Sub extends Base {}
    prepend(Sub, mod);

    new Sub();
    expect(seatings).toBe(1);
  });
});

describe("prepend", () => {
  it("does not re-copy an already-prepended module's members", () => {
    class Klass {
      greet(): string {
        return "class";
      }
    }
    const mod = {
      greet(): string {
        return "module";
      },
    };
    prepend(Klass, mod);
    expect(new Klass().greet()).toBe("module");

    (Klass.prototype as unknown as DynMethods).greet = () => "reopened";
    prepend(Klass, mod);
    expect(new Klass().greet()).toBe("reopened");
  });
});

describe("include", () => {
  it("copies instance methods onto the prototype", () => {
    class User {}
    const mod = {
      greet() {
        return "hello";
      },
    };
    include(User, mod);
    expect(new (User as unknown as new () => DynMethods)().greet()).toBe("hello");
  });

  it("is a no-op when the same module is included twice", () => {
    class User {}
    const mod = {
      greet() {
        return "module";
      },
    };
    include(User, mod);
    (User.prototype as unknown as DynMethods).greet = () => "reopened";
    include(User, mod);
    expect((new User() as unknown as DynMethods).greet()).toBe("reopened");
  });

  it("is a no-op when a superclass already included the module", () => {
    class Base {}
    const mod = {
      greet() {
        return "module";
      },
    };
    include(Base, mod);
    class Sub extends Base {}
    (Sub.prototype as unknown as DynMethods).greet = () => "sub";
    include(Sub, mod);
    expect((new Sub() as unknown as DynMethods).greet()).toBe("sub");
  });

  it("does not let a re-include clobber the class-body member it lost to", () => {
    class User {
      greet(): string {
        return "class-body";
      }
    }
    const mod = {
      greet() {
        return "module";
      },
    };
    include(User, mod);
    include(User, mod);
    expect(new User().greet()).toBe("class-body");
  });

  it("does not replace methods already on the prototype", () => {
    class User {
      greet() {
        return "original";
      }
    }
    include(User, {
      greet() {
        return "replaced";
      },
    });
    expect(new User().greet()).toBe("original");
  });

  it("later include wins over an earlier mixin, but class body beats both", () => {
    class User {
      classBody() {
        return "class-body";
      }
    }
    const A = {
      shared() {
        return "A";
      },
      classBody() {
        return "A-classBody";
      },
    };
    const B = {
      shared() {
        return "B";
      },
      classBody() {
        return "B-classBody";
      },
    };
    include(User, A);
    include(User, B);

    expect((new User() as unknown as DynMethods).shared()).toBe("B");
    expect(new User().classBody()).toBe("class-body");
  });

  it("resolves methods a Module defines after it was included", () => {
    class User {}
    const mod = new Module();
    include(User, mod);
    mod.defineMethod("greet", () => "hello");
    expect((new User() as unknown as { greet(): string }).greet()).toBe("hello");
    mod.undefMethod(...mod.instanceMethods());
    expect((new User() as unknown as { greet?: unknown }).greet).toBeUndefined();
  });

  it("propagates post-include method-table changes to every includer", () => {
    class A {}
    class B {}
    const mod = new Module();
    mod.defineMethod("original", () => "dump");
    include(A, mod);
    include(B, mod);
    type Dyn = { original?(): string; aliased?(): string };
    mod.aliasMethod("aliased", "original");
    expect((new A() as Dyn).aliased!()).toBe("dump");
    expect((new B() as Dyn).aliased!()).toBe("dump");
    mod.removeMethod("aliased");
    expect((new A() as Dyn).aliased).toBeUndefined();
    expect((new B() as Dyn).aliased).toBeUndefined();
    expect((new B() as Dyn).original!()).toBe("dump");
  });

  it("raises NameError removing or aliasing an undefined method", () => {
    const mod = new Module();
    expect(() => mod.removeMethod("missing")).toThrow(NameError);
    expect(() => mod.aliasMethod("x", "missing")).toThrow(NameError);
    class User {}
    mod.defineMethod("present", () => "here");
    include(User, mod);
    expect(() => mod.removeMethod("present", "missing")).toThrow(NameError);
    expect((new User() as { present?: unknown }).present).toBeUndefined();
  });

  it("undefMethod stops lookup where removeMethod falls through to the superclass", () => {
    class Parent {
      greet(): string {
        return "parent";
      }
    }
    const undefd = new Module();
    undefd.defineMethod("greet", () => "module");
    class Undefd extends Parent {}
    include(Undefd, undefd);
    undefd.undefMethod("greet");
    expect((new Undefd() as { greet?: unknown }).greet).toBeUndefined();
    expect(undefd.isMethodDefined("greet")).toBe(false);
    expect(undefd.instanceMethods()).toEqual([]);
    expect(() => undefd.undefMethod("missing")).toThrow(NameError);
    expect(() => new Module().undefMethod("toString")).toThrow(NameError);
    const included = new Module();
    included.include({ wave: () => "wave" });
    expect(included.undefMethod("wave")).toBe(included);

    const removed = new Module();
    removed.defineMethod("greet", () => "module");
    class Removed extends Parent {}
    include(Removed, removed);
    removed.removeMethod("greet");
    expect(new Removed().greet()).toBe("parent");
  });

  it("keeps a Module's own method ahead of a module it includes", () => {
    const mod = new Module();
    mod.defineMethod("x", () => "own");
    mod.include({ x: () => "other", y: () => "included" });
    class Host {}
    include(Host, mod);
    const host = new Host() as { x(): string; y(): string };
    expect(host.x()).toBe("own");
    expect(host.y()).toBe("included");
  });

  it("lets a later include replace an earlier included method, not an own one", () => {
    const mod = new Module();
    const first = { y: () => "first" };
    mod.include(first);
    mod.include({ y: () => "second" });
    expect((mod.instanceMethod("y")!.value as () => string)()).toBe("second");
    mod.defineMethod("y", () => "own");
    mod.include({ y: () => "third" });
    expect((mod.instanceMethod("y")!.value as () => string)()).toBe("own");
  });

  it("is a no-op when a Module includes the same module twice", () => {
    const mod = new Module();
    const inner = { y: () => "inner" };
    mod.include(inner);
    mod.defineMethod("y", () => "own");
    mod.include(inner);
    expect((mod.instanceMethod("y")!.value as () => string)()).toBe("own");
    expect(mod.instanceMethods()).toEqual(["y"]);
  });

  it("keeps a class-body method ahead of an included Module", () => {
    class User {
      greet() {
        return "original";
      }
    }
    const mod = new Module();
    include(User, mod);
    mod.defineMethod("greet", () => "replaced");
    expect(new User().greet()).toBe("original");
    expect(mod.isMethodDefined("greet")).toBe(true);
  });

  it("keeps an included Module ahead of the superclass", () => {
    class Parent {
      greet() {
        return "parent";
      }
    }
    class Child extends Parent {}
    const mod = new Module();
    include(Child, mod);
    mod.moduleEval((m) => {
      Object.defineProperty(m, "greet", { value: () => "module", configurable: true });
    });
    expect(new Child().greet()).toBe("module");
    expect(new Parent().greet()).toBe("parent");
  });

  it("fires the included callback after methods are copied", () => {
    const order: string[] = [];
    class User {}
    const mod = {
      greet() {
        return "hello";
      },
      [included](base: unknown) {
        order.push("included");
        expect(base).toBe(User);
        expect(new (base as new () => DynMethods)().greet()).toBe("hello");
      },
    };
    include(User, mod);
    expect(order).toEqual(["included"]);
  });

  it("fires the included callback for a module object, which has no instances to copy onto", () => {
    const namespace = {};
    const bases: unknown[] = [];
    const mod = {
      greet() {
        return "hello";
      },
      [included](base: unknown) {
        bases.push(base);
      },
    };
    include(namespace, mod);
    expect(bases).toEqual([namespace]);
    expect("greet" in namespace).toBe(false);
  });

  it("does not copy the included symbol onto the prototype", () => {
    class User {}
    const mod = {
      greet() {
        return "hello";
      },
      [included](_base: unknown) {},
    };
    include(User, mod);
    expect((User.prototype as DynSymbols)[included]).toBeUndefined();
  });

  it("works without an included callback", () => {
    class User {}
    include(User, {
      greet() {
        return "hello";
      },
    });
    expect(new (User as unknown as new () => DynMethods)().greet()).toBe("hello");
  });

  describe("class-prototype module (accessor descriptors)", () => {
    it("copies a getter/setter pair from a class module", () => {
      class Host {
        data: Record<string, unknown> = {};
      }
      class Mod {
        set key(v: unknown) {
          (this as unknown as Host).data.key = v;
        }
        get key(): unknown {
          return (this as unknown as Host).data.key;
        }
      }
      include(Host, Mod);
      const h = new Host();
      (h as unknown as DynProps).key = 42;
      expect((h as unknown as DynProps).key).toBe(42);
      expect(h.data.key).toBe(42);
    });

    it("copies plain methods from a class module", () => {
      class Host {}
      class Mod {
        greet(): string {
          return "hi";
        }
      }
      include(Host, Mod);
      expect((new Host() as unknown as DynMethods).greet()).toBe("hi");
    });

    it("does not replace a method already defined on the host (Ruby include semantics)", () => {
      class Host {
        greet(): string {
          return "original";
        }
      }
      class Mod {
        greet(): string {
          return "replaced";
        }
      }
      include(Host, Mod);
      expect(new Host().greet()).toBe("original");
    });

    it("fills in the missing half of an accessor pair", () => {
      class Host {
        data: Record<string, unknown> = {};
        get key(): unknown {
          return this.data.key;
        }
      }
      class Mod {
        set key(v: unknown) {
          (this as unknown as Host).data.key = v;
        }
        get key(): unknown {
          return "mod-getter";
        }
      }
      include(Host, Mod);
      const h = new Host();
      (h as unknown as DynProps).key = 7;
      expect(h.data.key).toBe(7);
      expect((h as unknown as DynProps).key).toBe(7);
    });

    it("later class module wins a plain-method collision, class body still beats both", () => {
      class Host {
        classBody(): string {
          return "class-body";
        }
      }
      class A {
        shared(): string {
          return "A";
        }
        classBody(): string {
          return "A-classBody";
        }
      }
      class B {
        shared(): string {
          return "B";
        }
        classBody(): string {
          return "B-classBody";
        }
      }
      include(Host, A);
      include(Host, B);
      expect((new Host() as unknown as DynMethods).shared()).toBe("B");
      expect(new Host().classBody()).toBe("class-body");
    });

    it("later class module's accessor half wins over an earlier mixin's", () => {
      class Host {
        data: Record<string, unknown> = {};
      }
      class A {
        get key(): unknown {
          return "A-getter";
        }
        set key(v: unknown) {
          (this as unknown as Host).data.key = `A:${v}`;
        }
      }
      class B {
        get key(): unknown {
          return "B-getter";
        }
      }
      include(Host, A);
      include(Host, B);
      const h = new Host();
      expect((h as unknown as DynProps).key).toBe("B-getter");
      (h as unknown as DynProps).key = 1;
      expect(h.data.key).toBe("A:1");
    });

    it("skips the class constructor", () => {
      class Host {}
      class Mod {
        constructor() {}
        greet(): string {
          return "hi";
        }
      }
      include(Host, Mod);
      expect(Object.getOwnPropertyDescriptor(Host.prototype, "constructor")?.value).toBe(Host);
    });
  });
});

describe("extend", () => {
  it("copies methods as static methods on the class", () => {
    class User {}
    extend(User, {
      findByName(name: string) {
        return `found:${name}`;
      },
    });
    expect((User as unknown as DynMethods).findByName("dean")).toBe("found:dean");
  });

  it("fires the extended callback after methods are copied", () => {
    const order: string[] = [];
    class User {}
    const mod = {
      findByName() {
        return "found";
      },
      [extended](base: unknown) {
        order.push("extended");
        expect(base).toBe(User);
        expect((base as DynMethods).findByName()).toBe("found");
      },
    };
    extend(User, mod);
    expect(order).toEqual(["extended"]);
  });

  it("does not copy the extended symbol onto the class", () => {
    class User {}
    const mod = {
      greet() {
        return "hello";
      },
      [extended](_base: unknown) {},
    };
    extend(User, mod);
    expect((User as unknown as DynSymbols)[extended]).toBeUndefined();
  });

  it("carries the methods a plain-object module inherits from its ancestors", () => {
    const parent = {
      inherited() {
        return "parent";
      },
      shadowed() {
        return "parent";
      },
    };
    const mod = Object.assign(Object.create(parent) as typeof parent, {
      shadowed() {
        return "own";
      },
    });
    const obj = {};
    extend(obj, mod);
    expect((obj as typeof parent).inherited()).toBe("parent");
    expect((obj as typeof parent).shadowed()).toBe("own");
  });

  it("returns the receiver", () => {
    const obj = {};
    expect(extend(obj, { hello() {} })).toBe(obj);
  });

  it("works without an extended callback", () => {
    class User {}
    extend(User, {
      findByName() {
        return "found";
      },
    });
    expect((User as unknown as DynMethods).findByName()).toBe("found");
  });

  it("leaves a class-body static alone", () => {
    class User {
      static findByName() {
        return "class body";
      }
    }
    extend(User, {
      findByName() {
        return "module";
      },
    });
    expect(User.findByName()).toBe("class body");
  });

  it("replaces a static installed by an earlier extend", () => {
    class User {}
    extend(User, {
      findByName() {
        return "first";
      },
    });
    extend(User, {
      findByName() {
        return "second";
      },
    });
    expect((User as unknown as DynMethods).findByName()).toBe("second");
  });

  it("does not treat an inherited static as the subclass's own class body", () => {
    class Base {
      static findByName() {
        return "base class body";
      }
    }
    class User extends Base {}
    extend(User, {
      findByName() {
        return "module";
      },
    });
    expect(User.findByName()).toBe("module");
    expect(Base.findByName()).toBe("base class body");
  });

  it("merges a module getter with a class-body setter", () => {
    const seen: unknown[] = [];
    class User {
      static set tableName(value: string) {
        seen.push(value);
      }
    }
    class Naming {
      static get tableName() {
        return "users";
      }
    }
    extend(User, Naming);
    expect((User as unknown as DynProps).tableName).toBe("users");
    (User as unknown as DynProps).tableName = "people";
    expect(seen).toEqual(["people"]);
  });

  it("replaces an earlier module getter while keeping the class-body setter", () => {
    const seen: unknown[] = [];
    class User {
      static set tableName(value: string) {
        seen.push(value);
      }
    }
    class First {
      static get tableName() {
        return "first";
      }
    }
    class Second {
      static get tableName() {
        return "second";
      }
    }
    extend(User, First);
    extend(User, Second);
    expect((User as unknown as DynProps).tableName).toBe("second");
    (User as unknown as DynProps).tableName = "people";
    expect(seen).toEqual(["people"]);
  });

  it("leaves a class-body getter alone while taking the module setter", () => {
    const seen: unknown[] = [];
    class User {
      static get tableName() {
        return "class body";
      }
    }
    class Naming {
      static set tableName(value: string) {
        seen.push(value);
      }
    }
    extend(User, Naming);
    expect((User as unknown as DynProps).tableName).toBe("class body");
    (User as unknown as DynProps).tableName = "people";
    expect(seen).toEqual(["people"]);
  });
});

describe("isModuleIncluded", () => {
  it("answers Ruby's Module#< for an included module", () => {
    const mod = {
      greet() {
        return "hello";
      },
    };
    class User {}
    class Post {}
    include(User, mod);
    expect(isModuleIncluded(User, mod)).toBe(true);
    expect(isModuleIncluded(Post, mod)).toBe(false);
  });

  it("sees a module included into a superclass", () => {
    const mod = {
      greet() {
        return "hello";
      },
    };
    class Base {}
    class User extends Base {}
    include(Base, mod);
    expect(isModuleIncluded(User, mod)).toBe(true);
  });

  it("sees a class module", () => {
    class Trackable {
      track() {
        return "tracked";
      }
    }
    class User {}
    include(User, Trackable);
    expect(isModuleIncluded(User, Trackable)).toBe(true);
  });
});

describe("Module#ancestors", () => {
  it("lists the class, its mixed-in modules most recent first, then each superclass", () => {
    const first = { a() {} };
    const second = { b() {} };
    const inherited = { c() {} };
    class Base {}
    class User extends Base {}
    include(Base, inherited);
    include(User, first);
    include(User, second);
    expect(rbModAncestors(User)).toEqual([
      User,
      second,
      first,
      Base,
      inherited,
      Object,
      Kernel,
      rbCBasicObject,
    ]);
  });

  it("lists MRI's ancestors for a core class", () => {
    const names = (x: unknown) => rbModAncestors(rbObjClass(x)).map(rbModName).join(" ");
    const dateTime = { [Symbol.toStringTag]: "Temporal.PlainDateTime" };
    expect(names(dateTime)).toBe("DateTime Date Comparable Object Kernel BasicObject");
    expect(names(1)).toBe("Integer Numeric Comparable Object Kernel BasicObject");
    expect(names(1.5)).toBe("Float Numeric Comparable Object Kernel BasicObject");
    expect(names(null)).toBe("NilClass Object Kernel BasicObject");
    expect(names({})).toMatch(/^Hash Enumerable /);
    const hash = new Hash<string, number>().set("a", 1).set("b", 2);
    const included = hash as unknown as {
      map(block: (pair: [string, number]) => string): string[];
    };
    expect(included.map(([key, value]) => key + value)).toEqual(["a1", "b2"]);
    const yielded: unknown[] = [];
    expect(hash.each((key: string, value: number) => yielded.push(key, value))).toBe(hash);
    expect(yielded).toEqual(["a", 1, "b", 2]);
    expect(names(class {})).toBe("Class Module Object Kernel BasicObject");
    expect(names("s")).toBe("String Comparable Object Kernel BasicObject");
    expect(names(new Date(0))).toBe("Time Comparable Object Kernel BasicObject");
    expect(rbModAncestors(rbCBasicObject)).toEqual([rbCBasicObject]);
  });

  it("answers one class object per core class, and the constructor otherwise", () => {
    class Klass {}
    expect(rbObjClass(1)).toBe(rbObjClass(2n));
    expect(rbObjClass(1)).not.toBe(rbObjClass(1.5));
    expect(rbModName(rbObjClass(() => {}))).toBe("Proc");
    expect(rbObjClass({})).toBe(Hash);
    expect(rbObjClass(rbObjSingletonClass(new Klass()).prototype)).toBe(Klass);
  });
});

describe("Included<>", () => {
  it("does not introduce a string index signature into the merged type", () => {
    const _Mod = {
      hello(this: unknown, name: string): string {
        return `hi ${name}`;
      },
    };
    type T = Included<typeof _Mod>;
    expectTypeOf<T>().toEqualTypeOf<{ hello: (name: string) => string }>();
    /* eslint-disable @typescript-eslint/no-unsafe-declaration-merging,
                      @typescript-eslint/no-empty-object-type */
    interface Host extends T {}
    class Host {
      readonly count: number = 0;
      readonly label: string = "";
    }
    const h = new Host();
    expect(h.count).toBe(0);
    expect(h.label).toBe("");
    /* eslint-enable @typescript-eslint/no-unsafe-declaration-merging,
                     @typescript-eslint/no-empty-object-type */
  });

  it("strips the this parameter and skips non-method properties", () => {
    const _Mod = {
      greet(this: { name: string }): string {
        return this.name;
      },
      version: 1 as const,
    };
    type T = Included<typeof _Mod>;
    expectTypeOf<T>().toEqualTypeOf<{ greet: () => string }>();
  });
});

describe("Extended<>", () => {
  it("does not introduce a string index signature into the merged type", () => {
    const _Mod = {
      connectedTo(this: unknown, role: string): number {
        return role.length;
      },
    };
    type T = Extended<typeof _Mod>;
    expectTypeOf<T>().toEqualTypeOf<{ connectedTo: (role: string) => number }>();
  });

  it("strips the this parameter and skips non-method properties", () => {
    const _Mod = {
      establish(this: { tag: string }): void {},
      pool: 5 as const,
    };
    type T = Extended<typeof _Mod>;
    expectTypeOf<T>().toEqualTypeOf<{ establish: () => void }>();
  });
});

describe("defineModule", () => {
  const pub = { one() {}, two() {} };
  const prot = { three() {} };
  const priv = { four() {}, fiveAlias: prot.three };

  it("composes the sections into one flat module", () => {
    const mod = defineModule(pub, prot, priv);
    expect(Object.keys(mod)).toEqual(["one", "two", "three", "four", "fiveAlias"]);
    expect(mod.three).toBe(prot.three);
  });

  it("stamps the section membership", () => {
    const sections = (defineModule(pub, prot, priv) as Record<symbol, unknown>)[
      moduleVisibility
    ] as ModuleVisibility;
    expect(sections).toEqual({
      public: ["one", "two"],
      protected: ["three"],
      private: ["four", "fiveAlias"],
    });
  });

  it("treats the protected and private sections as optional", () => {
    const sections = (defineModule(pub) as Record<symbol, unknown>)[
      moduleVisibility
    ] as ModuleVisibility;
    expect(sections).toEqual({ public: ["one", "two"], protected: [], private: [] });
  });

  it("raises when a name appears in two sections", () => {
    expect(() => defineModule(pub, { one() {} })).toThrow(
      "defineModule: one appears in both the public and protected sections",
    );
  });

  it("does not expose the stamp as a module member", () => {
    const mod = defineModule(pub, prot, priv);
    expect(Object.keys(mod)).not.toContain("moduleVisibility");
    expect(JSON.stringify(Object.keys(mod))).not.toContain("Symbol");
  });
});

describe("publicInstanceMethods", () => {
  it("returns only the public section of a defineModule module", () => {
    const mod = defineModule({ one() {}, two() {} }, { three() {} }, { four() {} });
    expect(publicInstanceMethods(mod, false)).toEqual(["one", "two"]);
  });

  it("returns every key of a plain module object", () => {
    expect(publicInstanceMethods({ one() {}, two() {} }, false)).toEqual(["one", "two"]);
  });

  it("returns the carrier methods of a Module instance", () => {
    const mod = new Module();
    mod.defineMethod("greet", () => "hello");
    expect(publicInstanceMethods(mod)).toEqual(["greet"]);
  });

  it("walks a class prototype, own members only when include_super is false", () => {
    class Super {
      inherited() {}
    }
    class Sub extends Super {
      own() {}
    }
    expect(publicInstanceMethods(Sub, false)).toEqual(["own"]);
    expect(publicInstanceMethods(Sub).sort()).toEqual(["inherited", "own"]);
  });
});

describe("Module#superMethod", () => {
  it("resumes lookup above the includer's link, bound to the receiver", () => {
    class Parent {
      greet(this: { name: string }): string {
        return `parent ${this.name}`;
      }
    }
    class Child extends Parent {
      name = "c";
    }
    const mod = new Module();
    mod.defineMethod("greet", function (this: Child) {
      return `mod+${mod.superMethod(this, "greet")!()}`;
    });
    include(Child, mod);
    expect(new Child().greet()).toBe("mod+parent c");
  });

  it("answers the next reader for `name` and the next writer for `name=`", () => {
    class Record {
      stored: unknown = "raw";
      get title(): unknown {
        return this.stored;
      }
      set title(value: unknown) {
        this.stored = value;
      }
    }
    class Sub extends Record {}
    const mod = new Module((m) => {
      m.moduleEval((table) => {
        Object.defineProperty(table, "title", {
          configurable: true,
          get(this: Sub) {
            return `<${m.superMethod(this, "title")!()}>`;
          },
          set(this: Sub, value: unknown) {
            m.superMethod(this, "title=")!(`${value}!`);
          },
        });
      });
    });
    include(Sub, mod);
    const record = new Sub();
    record.title = "x";
    expect(record.stored).toBe("x!");
    expect(record.title).toBe("<x!>");
  });

  it("resumes above a class's singleton link, and the class still constructs", () => {
    class Parent {
      value: string;
      constructor(value: string) {
        this.value = value;
      }
    }
    class Child extends Parent {
      constructor(value: string) {
        super(`child ${value}`);
      }
    }
    const core = new Module((m) => m.defineMethod("findBy", () => "core"));
    const queries = new Module((m) => {
      m.defineMethod("findBy", function (this: object) {
        return `queries+${m.superMethod(this, "findBy")!()}`;
      });
    });
    extend(Child, core);
    extend(Child, queries);
    class Grandchild extends Child {}
    expect((Grandchild as unknown as { findBy(): string }).findBy()).toBe("queries+core");
    expect(new Grandchild("x").value).toBe("child x");
  });

  it("answers undefined when no ancestor defines the method", () => {
    class Lonely {}
    const mod = new Module();
    mod.defineMethod("greet", () => "mod");
    include(Lonely, mod);
    expect(mod.superMethod(new Lonely(), "greet")).toBeUndefined();
  });

  it("ends the search in Kernel, where every ancestry ends", () => {
    class Record {
      copiedFrom: unknown;
      initializeCopy(orig: unknown): void {
        this.copiedFrom = orig;
      }
    }
    const mod = new Module();
    mod.defineMethod("initializeDup", function (this: Record, orig: unknown) {
      return mod.superMethod(this, "initializeDup")!(orig);
    });
    mod.defineMethod("freeze", function (this: Record) {
      return mod.superMethod(this, "freeze")!();
    });
    include(Record, mod);

    const orig = new Record();
    const record = rbObjDup(orig);
    expect(record.copiedFrom).toBe(orig);
    expect((record as unknown as { freeze(): Record }).freeze()).toBe(record);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it("answers a method a gem defined on Kernel, and no writer", () => {
    class Plain {}
    const mod = new Module();
    include(Plain, mod);
    Kernel.defineMethod("kernelProbe", function (this: object) {
      return this;
    });
    try {
      const plain = new Plain();
      expect(mod.superMethod(plain, "kernelProbe")!()).toBe(plain);
      expect(mod.superMethod(plain, "kernelProbe=")).toBeUndefined();
    } finally {
      Kernel.removeMethod("kernelProbe");
    }
  });

  it("answers undefined for a receiver whose ancestry lacks the module", () => {
    class Outside {}
    const mod = new Module();
    expect(mod.superMethod(new Outside(), "toString")).toBeUndefined();
  });

  it("finds each includer's own link", () => {
    class A {
      who(): string {
        return "A";
      }
    }
    class B {
      who(): string {
        return "B";
      }
    }
    class SubA extends A {}
    class SubB extends B {}
    const mod = new Module();
    mod.defineMethod("who", function (this: object) {
      return `m${mod.superMethod(this, "who")!()}`;
    });
    include(SubA, mod);
    include(SubB, mod);
    expect((new SubA() as A).who()).toBe("mA");
    expect((new SubB() as B).who()).toBe("mB");
  });

  it("resumes above an extended object's link, next module first", () => {
    class Receiver {
      greeting(): string {
        return "receiver";
      }
    }
    const named = new Module();
    named.defineMethod("greeting", function (this: object) {
      return `${named.superMethod(this, "greeting")!()} :)`;
    });
    const named2 = new Module();
    named2.defineMethod("greeting", () => "hullo");
    const obj = new Receiver();
    extend(obj, named2);
    extend(obj, named);
    expect(obj.greeting()).toBe("hullo :)");
    expect(new Receiver().greeting()).toBe("receiver");
    const bare = new Receiver();
    extend(bare, named);
    expect(bare.greeting()).toBe("receiver :)");
  });

  it("exposes a method defined after extend on the already-extended object", () => {
    const mod = new Module();
    const obj = {} as { late?: () => string };
    extend(obj, mod);
    mod.defineMethod("late", () => "late");
    expect(obj.late!()).toBe("late");
  });

  it("reaches through a subclass of the includer", () => {
    class Base0 {
      who(): string {
        return "base";
      }
    }
    class Mid extends Base0 {}
    class Leaf extends Mid {}
    const mod = new Module();
    mod.defineMethod("who", function (this: object) {
      return `m${mod.superMethod(this, "who")!()}`;
    });
    include(Mid, mod);
    expect(new Leaf().who()).toBe("mbase");
  });
});

describe("Module.new", () => {
  it("hands its block the new module, whose methods an includer answers", () => {
    let yielded: Module | undefined;
    const mod = new Module((m) => {
      yielded = m;
      m.defineMethod("greet", () => "hello");
    });
    class Host {}
    include(Host, mod);
    expect(yielded).toBe(mod);
    expect((new Host() as unknown as { greet(): string }).greet()).toBe("hello");
  });
});

describe("rbObjClone", () => {
  it("copies class, ivars, singleton methods and frozen state", () => {
    const a = () => "a";
    const obj = Object.assign(new (class Host {})(), { ivar: 1 });
    extend(obj, { a });
    const clone = rbObjClone(Object.freeze(obj));

    expect(Object.getPrototypeOf(clone)).toBe(Object.getPrototypeOf(obj));
    expect(clone).toMatchObject({ ivar: 1, a });
    expect(Object.isFrozen(clone)).toBe(true);
  });

  it("dispatches initializeClone on the copy before freezing it", () => {
    class Host {
      inner = [1];
      initializeClone(_orig: Host): void {
        this.inner = [...this.inner];
      }
    }
    const obj = Object.freeze(new Host());
    const clone = rbObjClone(obj);
    expect(clone.inner).not.toBe(obj.inner);
    expect(Object.isFrozen(clone)).toBe(true);
  });

  it("returns a special object as is", () => {
    expect(rbObjClone(1)).toBe(1);
    expect(rbObjClone("a")).toBe("a");
    expect(rbObjClone(null)).toBe(null);
  });

  it("allocates an array as an array holding the same elements", () => {
    const node = {};
    const ary = [node, 2];
    const clone = rbObjClone(ary);
    expect(Array.isArray(clone)).toBe(true);
    expect(clone).not.toBe(ary);
    expect(clone).toEqual(ary);
    expect(clone[0]).toBe(node);
    clone.push(3);
    expect(ary).toHaveLength(2);
  });

  it("keeps a frozen array frozen", () => {
    const clone = rbObjClone(Object.freeze([1, 2]));
    expect(Array.isArray(clone)).toBe(true);
    expect(clone).toEqual([1, 2]);
    expect(Object.isFrozen(clone)).toBe(true);
  });
});

describe("rbObjDup", () => {
  it("copies ivars, drops singleton methods and frozen state, dispatches initializeDup", () => {
    class Host {
      ivar = 1;
      origin: Host | null = null;
      initializeDup(orig: Host): void {
        this.origin = orig;
      }
    }
    const obj = new Host();
    extend(obj, { a: () => "a" });
    const dup = rbObjDup(Object.freeze(obj));

    expect(Object.getPrototypeOf(dup)).toBe(Host.prototype);
    expect(dup.ivar).toBe(1);
    expect(dup.origin).toBe(obj);
    expect("a" in dup).toBe(false);
    expect(Object.isFrozen(dup)).toBe(false);
  });

  it("falls back to initializeCopy", () => {
    class Host {
      copied = false;
      initializeCopy(_orig: Host): void {
        this.copied = true;
      }
    }
    expect(rbObjDup(new Host()).copied).toBe(true);
  });

  it("returns a special object as is", () => {
    expect(rbObjDup(1)).toBe(1);
    expect(rbObjDup("a")).toBe("a");
    expect(rbObjDup(null)).toBe(null);
  });

  it("allocates an array as an unfrozen array holding the same elements", () => {
    const ary: unknown[] = Object.freeze([{}, 2]) as unknown[];
    const dup = rbObjDup(ary);
    expect(Array.isArray(dup)).toBe(true);
    expect(dup).not.toBe(ary);
    expect(dup[0]).toBe(ary[0]);
    expect(Object.isFrozen(dup)).toBe(false);
    dup.push(3);
    expect(ary).toHaveLength(2);
  });
});

describe("Module#include?", () => {
  it("answers for a module included directly or through an included Module", () => {
    const plain = { hello: () => "hello" };
    const inner = new Module((mod) => mod.include(plain));
    const outer = new Module((mod) => mod.include(inner));
    expect(outer.isInclude(inner)).toBe(true);
    expect(outer.isInclude(plain)).toBe(true);
    expect(inner.isInclude(outer)).toBe(false);
    expect(new Module().isInclude(plain)).toBe(false);
  });
});

describe("Module#include of an accessor", () => {
  it("carries a reader and writer pair without calling the reader", () => {
    const mod = new Module().include({
      get title(): string {
        return (this as unknown as { _title: string })._title;
      },
      set title(value: string) {
        (this as unknown as { _title: string })._title = value;
      },
    });
    class Host {}
    include(Host, mod);
    const host = new Host() as { title: string; _title?: string };
    host.title = "a";
    expect(host._title).toBe("a");
    expect(host.title).toBe("a");
  });

  it("installs an ES module namespace's exports as methods, not accessors", () => {
    const mod = new Module().include(EnsureNamespace);
    const entry = mod.instanceMethod("rbEnsure")!;
    expect(entry.value).toBe(EnsureNamespace.rbEnsure);
    expect(entry.get).toBeUndefined();
  });
});

describe("Module#include of a Module", () => {
  it("splices the included module beneath the includer, live", () => {
    const inner = new Module();
    const outer = new Module((mod) => mod.include(inner));
    outer.defineMethod("who", () => "outer");
    inner.defineMethod("who", () => "inner");
    class Host {}
    include(Host, outer);
    inner.defineMethod("later", () => "later");
    const host = new Host() as DynMethods;
    expect(host.who()).toBe("outer");
    expect(host.later()).toBe("later");
    expect(isModuleIncluded(Host, inner)).toBe(true);
  });

  it("extends an object with the included module too", () => {
    const inner = new Module((mod) => mod.defineMethod("fromInner", () => "inner"));
    const outer = new Module((mod) => mod.include(inner));
    const obj = {} as DynMethods;
    extend(obj, outer);
    expect(obj.fromInner()).toBe("inner");
  });
});

describe("include with an append_features hook", () => {
  it("calls included after append_features", () => {
    const calls: string[] = [];
    const mod = new Module() as Module & DynMethods;
    mod.appendFeatures = function (this: Module, base: new () => unknown) {
      calls.push("appendFeatures");
      Module.prototype.appendFeatures.call(this, base);
    };
    mod.included = () => calls.push("included");
    include(class {}, mod);
    expect(calls).toEqual(["appendFeatures", "included"]);
  });
});

describe("Module#dup", () => {
  it("copies the method table and singleton methods without sharing the table", () => {
    const mod = new Module((m) => m.defineMethod("greet", () => "hi")) as Module & DynProps;
    mod.label = "original";
    const copy = mod.dup();
    copy.defineMethod("extra", () => "extra");
    expect(copy.label).toBe("original");
    expect(copy.instanceMethods()).toEqual(["greet", "extra"]);
    expect(mod.instanceMethods()).toEqual(["greet"]);
  });
});

describe("Module#const_defined?", () => {
  it("answers whether the module or an ancestor holds the constant", () => {
    class Topic {}
    class Reply extends Topic {}
    const mod = new Module();
    expect(rbModConstDefined(Topic, "Generated")).toBe(false);
    rbModConstSet(Topic, "Generated", 1);
    rbModConstSet(mod, "ATTR_d697", "my");
    expect(rbModConstDefined(Topic, "Generated")).toBe(true);
    expect(rbModConstDefined(Reply, "Generated")).toBe(true);
    expect(rbModConstDefined(mod, "ATTR_d697")).toBe(true);
    expect(rbModConstDefined(mod, "Generated")).toBe(false);
  });

  it("rbModConstDefined walks a :: path from the top-level table", () => {
    const db = { Adapters: { Mega: class {} } };
    registerConstant("ConstDefinedTrailsDb", db);
    try {
      expect(rbModConstDefined(Object, "ConstDefinedTrailsDb")).toBe(true);
      expect(rbModConstDefined(Object, "ConstDefinedTrailsDb::Adapters::Mega")).toBe(true);
      expect(rbModConstDefined(Object, "ConstDefinedTrailsDb::Adapters::Nope")).toBe(false);
      expect(rbModConstDefined(Object, "ConstDefinedTrailsNope::Adapters")).toBe(false);
      expect(rbModConstDefined(Object, "ConstDefinedTrailsDb", false)).toBe(false);
      expect(() => rbModConstGet(Object, "ConstDefinedTrailsNope")).toThrow(
        "uninitialized constant ConstDefinedTrailsNope",
      );
    } finally {
      unregisterConstant("ConstDefinedTrailsDb", db);
    }
  });

  it("looks at the module alone when recur is false", () => {
    class Topic {}
    class Reply extends Topic {}
    rbModConstSet(Topic, "Generated", 1);
    expect(rbModConstDefined(Topic, "Generated", false)).toBe(true);
    expect(rbModConstDefined(Reply, "Generated", false)).toBe(false);
  });

  it("raises NameError for a name that is not a constant name", () => {
    class Topic {}
    expect(() => rbModConstDefined(Topic, "name")).toThrow(NameError);
    expect(() => rbModConstDefined(Topic, "name")).toThrow("wrong constant name name");
  });
});

describe("Module#const_set", () => {
  it("names an anonymous module after the constant it is bound to", () => {
    class Topic {}
    const mod = new Module();
    expect(mod.name).toBeNull();
    expect(rbModConstSet(Topic, "Generated", mod)).toBe(mod);
    expect((Topic as unknown as { Generated: Module }).Generated).toBe(mod);
    expect(mod.name).toBe("Topic::Generated");
    expect(mod.inspect()).toBe("Topic::Generated");
  });

  it("names a class after the constant it is bound to", () => {
    const Namespace = { name: "Namespace" };
    class Topic {}
    expect(rbModName(Topic)).toBe("Topic");
    expect(rbModConstSet(Namespace, "Topic", Topic)).toBe(Topic);
    expect(rbModName(Topic)).toBe("Namespace::Topic");
    expect(rbModToS(Topic)).toBe("Namespace::Topic");
    class Reply {}
    rbModConstSet(Topic, "Reply", Reply);
    expect(rbModName(Reply)).toBe("Namespace::Topic::Reply");
    expect(rbModName((() => class {})())).toBeNull();
  });

  it("gives a module bound under an anonymous owner a temporary path until a named owner binds it", () => {
    const owner = new Module();
    const mod = new Module();
    rbModConstSet(owner, "X", mod);
    expect(mod.name).toBe(`${owner.inspect()}::X`);
    class N {}
    rbModConstSet(N, "Z", mod);
    expect(mod.name).toBe("N::Z");
  });

  it("paths a module under an anonymous class by the class's temporary path", () => {
    const owner = (() => class {})();
    const mod = new Module();
    rbModConstSet(owner, "X", mod);
    expect(owner.name).toBe("");
    expect(mod.name).toMatch(/^#<Class:0x[0-9a-f]{16}>::X$/);
    expect(mod.name).toBe(`${rbModToS(owner)}::X`);
  });

  it("raises NameError for a name that is not a constant name", () => {
    expect(() => rbModConstSet(class N {}, "foo", 1)).toThrow(
      new NameError("wrong constant name foo", "foo"),
    );
  });
});

describe("include — a module's own `included` shadows the one it was extended with", () => {
  it("sends the symbol-keyed hook after appendFeatures, not the string-named one", () => {
    const calls: string[] = [];
    const mod = new Module() as Module & {
      appendFeatures(base: unknown): void;
      included(base: unknown): void;
      [included](base: unknown): void;
    };
    mod.appendFeatures = () => void calls.push("appendFeatures");
    mod.included = () => void calls.push("extended included");
    mod[included] = () => void calls.push("own included");

    include(class Host {}, mod);
    new Module().include(mod);

    expect(calls).toEqual(["appendFeatures", "own included", "appendFeatures", "own included"]);
  });
});

describe("Module#prependFeatures", () => {
  it("splices the module above the class's own method, which superMethod resumes at", () => {
    class Klass {
      greet(name: string): string {
        return `class ${name}`;
      }
      other(): string {
        return "other";
      }
    }
    const mod: Module = new Module((m) => {
      m.defineMethod("greet", function (this: object, name: string) {
        return `module > ${mod.superMethod(this, "greet")!(name)}`;
      });
    });
    prepend(Klass, mod);

    expect(new Klass().greet("a")).toBe("module > class a");
    expect(new Klass().other()).toBe("other");
    expect(Object.prototype.hasOwnProperty.call(Klass.prototype, "greet")).toBe(false);
  });

  it("puts a later prepend above an earlier one, and a later include beneath the class", () => {
    class Klass {
      greet(): string {
        return "class";
      }
    }
    const first: Module = new Module((m) => {
      m.defineMethod("greet", function (this: object) {
        return `first > ${first.superMethod(this, "greet")!()}`;
      });
    });
    const second: Module = new Module((m) => {
      m.defineMethod("greet", function (this: object) {
        return `second > ${second.superMethod(this, "greet")!()}`;
      });
    });
    const beneath: Module = new Module((m) => {
      m.defineMethod("greet", () => "included");
    });
    prepend(Klass, first);
    prepend(Klass, second);
    include(Klass, beneath);

    expect(new Klass().greet()).toBe("second > first > class");
  });

  it("answers no super method where neither the class nor an ancestor defines one", () => {
    class Klass {}
    const mod: Module = new Module((m) => {
      m.defineMethod("greet", function (this: object) {
        return mod.superMethod(this, "greet");
      });
    });
    prepend(Klass, mod);

    expect((new Klass() as unknown as DynMethods).greet()).toBeUndefined();
  });

  it("keeps a subclass constructor chain when prepended onto a class's singleton", () => {
    class Parent {
      static build(): string {
        return "parent";
      }
    }
    class Child extends Parent {
      static build(): string {
        return "child";
      }
    }
    const mod: Module = new Module((m) => {
      m.defineMethod("build", function (this: object) {
        return `module > ${mod.superMethod(this, "build")!()}`;
      });
    });
    prepend({ prototype: Child } as never, mod);

    expect(Child.build()).toBe("module > child");
    expect(new Child()).toBeInstanceOf(Parent);
  });
});
