import { describe, it, expect, beforeEach } from "vitest";

import { Configurable } from "./configurable.js";
import { NameError } from "./core-ext/name-error.js";

class Parent {
  static config = Configurable.ClassMethods.config;
  static configAccessor = Configurable.ClassMethods.configAccessor;
  config = Configurable.config;
}
Parent.configAccessor("foo");
Parent.configAccessor("bar", { instanceReader: false, instanceWriter: false });
Parent.configAccessor("baz", { instanceAccessor: false });

class Child extends Parent {}

/**
 * Mirrors minitest's `assert_not_respond_to`. Ruby's `foo=` writer is a JS
 * setter on the property itself, so a trailing `=` asks about the setter half.
 */
function assertNotRespondTo(object: any, method: string): void {
  expect(respondTo(object, method)).toBe(false);
}

function respondTo(object: any, method: string): boolean {
  const writer = method.endsWith("=");
  const name = writer ? method.slice(0, -1) : method;
  for (let proto = object; proto != null; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (descriptor) return writer ? descriptor.set != null : descriptor.get != null;
  }
  return false;
}

/** Mirrors `assert_method_defined` (configurable_test.rb:130-133). */
function assertMethodDefined(object: any, method: string): void {
  const methods = publicMethods(object);
  expect(methods).toContain(method);
}

/** Mirrors `assert_method_not_defined` (configurable_test.rb:135-138). */
function assertMethodNotDefined(object: any, method: string): void {
  const methods = publicMethods(object);
  expect(methods).not.toContain(method);
}

/** Ruby's `Object#public_methods`, which spans the whole ancestor chain. */
function publicMethods(object: any): string[] {
  const methods: string[] = [];
  for (let proto = object; proto != null; proto = Object.getPrototypeOf(proto)) {
    methods.push(...Object.getOwnPropertyNames(proto));
  }
  return methods;
}

describe("ConfigurableActiveSupport", () => {
  beforeEach(() => {
    Parent.config().clear();
    (Parent.config() as any).foo = "bar";

    Child.config().clear();
  });

  it("adds a configuration hash", () => {
    expect(Parent.config().toH()).toEqual({ foo: "bar" });
  });

  it("adds a configuration hash to a module as well", () => {
    const mixin: any = { config: Configurable.ClassMethods.config };
    mixin.config().foo = "bar";
    expect(mixin.config().toH()).toEqual({ foo: "bar" });
  });

  it("configuration hash is inheritable", () => {
    expect((Child.config() as any).foo).toBe("bar");
    expect((Parent.config() as any).foo).toBe("bar");

    (Child.config() as any).foo = "baz";
    expect((Child.config() as any).foo).toBe("baz");
    expect((Parent.config() as any).foo).toBe("bar");
  });

  it("configuration accessors are not available on instance", () => {
    const instance = new Parent();

    assertNotRespondTo(instance, "bar");
    assertNotRespondTo(instance, "bar=");

    assertNotRespondTo(instance, "baz");
    assertNotRespondTo(instance, "baz=");
  });

  it("configuration accessors can take a default value as a block", () => {
    const parent: any = class {
      static config = Configurable.ClassMethods.config;
      static configAccessor = Configurable.ClassMethods.configAccessor;
    };
    parent.configAccessor("hairColors", "tshirtColors", {
      default: () => ["black", "blue", "white"],
    });

    expect(parent.hairColors).toEqual(["black", "blue", "white"]);
    expect(parent.tshirtColors).toEqual(["black", "blue", "white"]);
  });

  it("configuration accessors can take a default value as an option", () => {
    const parent: any = class {
      static config = Configurable.ClassMethods.config;
      static configAccessor = Configurable.ClassMethods.configAccessor;
    };
    parent.configAccessor("foo", { default: "bar" });

    expect(parent.foo).toBe("bar");
  });

  it("configuration hash is available on instance", () => {
    const instance = new Parent() as any;
    expect(instance.config().foo).toBe("bar");
    expect((Parent.config() as any).foo).toBe("bar");

    instance.config().foo = "baz";
    expect(instance.config().foo).toBe("baz");
    expect((Parent.config() as any).foo).toBe("bar");
  });

  it("configuration is crystalizeable", () => {
    const parent: any = class {
      static config = Configurable.ClassMethods.config;
      config = Configurable.config;
    };
    const child: any = class extends parent {};

    parent.config().bar = "foo";
    assertMethodNotDefined(parent.config(), "bar");
    assertMethodNotDefined(child.config(), "bar");
    assertMethodNotDefined(new child().config(), "bar");

    parent.config().compileMethodsBang();
    expect(parent.config().bar).toBe("foo");
    expect(new child().config().bar).toBe("foo");

    assertMethodDefined(parent.config(), "bar");
    assertMethodDefined(child.config(), "bar");
    assertMethodDefined(new child().config(), "bar");
  });

  it("should raise name error if attribute name is invalid", () => {
    expect(() => {
      const klass: any = class {
        static configAccessor = Configurable.ClassMethods.configAccessor;
      };
      klass.configAccessor("invalid attribute name");
    }).toThrow(NameError);

    expect(() => {
      const klass: any = class {
        static configAccessor = Configurable.ClassMethods.configAccessor;
      };
      klass.configAccessor("invalid\nattribute");
    }).toThrow(NameError);

    expect(() => {
      const klass: any = class {
        static configAccessor = Configurable.ClassMethods.configAccessor;
      };
      klass.configAccessor("invalid\n");
    }).toThrow(NameError);
  });

  it.skip("the config_accessor method should not be publicly callable");
});
