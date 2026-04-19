import { describe, it, expect } from "vitest";
import { include, extend, included, extended } from "./include.js";

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
