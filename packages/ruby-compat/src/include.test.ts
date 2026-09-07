import { describe, it, expect, expectTypeOf } from "vitest";
import {
  include,
  prepend,
  extend,
  included,
  extended,
  Module,
  initialize,
  initializeIncludedModules,
  isModuleIncluded,
  defineModule,
  moduleVisibility,
  publicInstanceMethods,
  type ModuleVisibility,
  type Included,
  type Extended,
} from "./include.js";

type DynMethods = Record<string, (...args: unknown[]) => unknown>;
type DynProps = Record<string, unknown>;
type DynSymbols = Record<symbol, unknown>;

describe("initializeIncludedModules", () => {
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
