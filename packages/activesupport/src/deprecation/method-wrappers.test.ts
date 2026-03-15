import { afterEach, describe, expect, it, vi } from "vitest";

describe("MethodWrappersTest", () => {
  function deprecateMethod(obj: Record<string, unknown>, name: string, message?: string) {
    const original = obj[name] as Function;
    obj[name] = function (...args: unknown[]) {
      console.warn(message ?? `${name} is deprecated`);
      return original.apply(this, args);
    };
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deprecate methods without alternate method", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const obj: Record<string, unknown> = {
      old_method() {
        return "result";
      },
    };
    deprecateMethod(obj, "old_method");
    (obj.old_method as () => string)();
    expect(spy).toHaveBeenCalled();
    expect(spy.mock.calls[0][0]).toContain("old_method");
  });

  it("deprecate methods warning default", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const obj: Record<string, unknown> = {
      foo() {
        return 1;
      },
    };
    deprecateMethod(obj, "foo");
    (obj.foo as () => number)();
    expect(spy).toHaveBeenCalled();
  });

  it("deprecate methods warning with optional deprecator", () => {
    const collected: string[] = [];
    const obj: Record<string, unknown> = {
      bar() {
        return 2;
      },
    };
    const original = obj.bar as Function;
    obj.bar = function () {
      collected.push("bar is deprecated, use baz");
      return original.call(this);
    };
    expect((obj.bar as () => number)()).toBe(2);
    expect(collected[0]).toContain("deprecated");
  });

  it("deprecate methods protected method", () => {
    class MyClass {
      protected_method() {
        return "protected";
      }
    }
    const proto = MyClass.prototype as unknown as Record<string, unknown>;
    const orig = proto.protected_method as Function;
    const warnings: string[] = [];
    proto.protected_method = function () {
      warnings.push("protected_method deprecated");
      return orig.call(this);
    };
    const inst = new MyClass();
    expect(inst.protected_method()).toBe("protected");
    expect(warnings[0]).toContain("deprecated");
  });

  it("deprecate methods private method", () => {
    class MyClass {
      private_method() {
        return "private";
      }
    }
    const proto = MyClass.prototype as unknown as Record<string, unknown>;
    deprecateMethod(proto, "private_method");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const inst = new MyClass();
    inst.private_method();
    expect(spy).toHaveBeenCalled();
  });

  it("deprecate class method", () => {
    class MyClass {
      static class_method() {
        return "class";
      }
    }
    const cls = MyClass as unknown as Record<string, unknown>;
    deprecateMethod(cls, "class_method");
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    (MyClass as unknown as { class_method(): string }).class_method();
    expect(spy).toHaveBeenCalled();
  });

  it("deprecate method when class extends module", () => {
    class Base {
      shared() {
        return "base";
      }
    }
    class Child extends Base {}
    const proto = Child.prototype as unknown as Record<string, unknown>;
    proto.shared = function () {
      console.warn("shared is deprecated");
      return Base.prototype.shared.call(this);
    };
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    new Child().shared();
    expect(spy).toHaveBeenCalledWith("shared is deprecated");
  });
});
