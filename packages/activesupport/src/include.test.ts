import { describe, it, expect, expectTypeOf } from "vitest";
import { include, extend, included, extended, type Included, type Extended } from "./include.js";

describe("include", () => {
  it("copies instance methods onto the prototype", () => {
    class User {}
    const mod = {
      greet() {
        return "hello";
      },
    };
    include(User, mod);
    expect(new (User as any)().greet()).toBe("hello");
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

  it("fires the included callback after methods are copied", () => {
    const order: string[] = [];
    class User {}
    const mod = {
      greet() {
        return "hello";
      },
      [included](base: any) {
        order.push("included");
        expect(base).toBe(User);
        expect(new base().greet()).toBe("hello");
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
      [included](_base: any) {},
    };
    include(User, mod);
    expect((User.prototype as any)[included]).toBeUndefined();
  });

  it("works without an included callback", () => {
    class User {}
    include(User, {
      greet() {
        return "hello";
      },
    });
    expect(new (User as any)().greet()).toBe("hello");
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
      (h as any).key = 42;
      expect((h as any).key).toBe(42);
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
      expect((new Host() as any).greet()).toBe("hi");
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
        // Only a getter — no setter. include() should install the mixin's setter.
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
      (h as any).key = 7;
      expect(h.data.key).toBe(7);
      // Host's getter wins; mod's getter never runs.
      expect((h as any).key).toBe(7);
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
    expect((User as any).findByName("dean")).toBe("found:dean");
  });

  it("fires the extended callback after methods are copied", () => {
    const order: string[] = [];
    class User {}
    const mod = {
      findByName() {
        return "found";
      },
      [extended](base: any) {
        order.push("extended");
        expect(base).toBe(User);
        expect(base.findByName()).toBe("found");
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
      [extended](_base: any) {},
    };
    extend(User, mod);
    expect((User as any)[extended]).toBeUndefined();
  });

  it("works without an extended callback", () => {
    class User {}
    extend(User, {
      findByName() {
        return "found";
      },
    });
    expect((User as any).findByName()).toBe("found");
  });
});

describe("Included<>", () => {
  // Regression for https://github.com/blazetrailsdev/trails/pull/967 —
  // when Included<> was constrained over `Record<string, Function>`, the
  // resulting mapped type carried a string index signature that propagated
  // into the merging class and forced every subclass field to be
  // function-typed. Mixing into a class with non-method fields broke.
  it("does not introduce a string index signature into the merged type", () => {
    const Mod = {
      hello(this: unknown, name: string): string {
        return `hi ${name}`;
      },
    };
    type T = Included<typeof Mod>;
    expectTypeOf<T>().toEqualTypeOf<{ hello: (name: string) => string }>();
    // A class with non-function fields can extend the Included<> interface
    // without TS demanding those fields conform to the function signature.
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
    const Mod = {
      greet(this: { name: string }): string {
        return this.name;
      },
      version: 1 as const,
    };
    type T = Included<typeof Mod>;
    expectTypeOf<T>().toEqualTypeOf<{ greet: () => string }>();
  });
});

describe("Extended<>", () => {
  // Extended<> shares its implementation with Included<> via the internal
  // CallableMethods<> helper. Mirror the Included<> regression assertions
  // so a future divergence in either type's behavior fails its own test.
  it("does not introduce a string index signature into the merged type", () => {
    const Mod = {
      connectedTo(this: unknown, role: string): number {
        return role.length;
      },
    };
    type T = Extended<typeof Mod>;
    expectTypeOf<T>().toEqualTypeOf<{ connectedTo: (role: string) => number }>();
  });

  it("strips the this parameter and skips non-method properties", () => {
    const Mod = {
      establish(this: { tag: string }): void {},
      pool: 5 as const,
    };
    type T = Extended<typeof Mod>;
    expectTypeOf<T>().toEqualTypeOf<{ establish: () => void }>();
  });
});
