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
