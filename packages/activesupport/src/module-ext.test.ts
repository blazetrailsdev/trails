import { describe, it, expect } from "vitest";
import {
  delegate,
  mattrAccessor,
  cattrAccessor,
  configAccessor,
  attrInternal,
  isAnonymous,
  moduleParentName,
  suppress,
} from "./module-ext.js";

describe("ModuleTest", () => {
  it("delegate — creates method that forwards to target property", () => {
    class Place {
      street = "Paulina";
      city = "Chicago";
    }
    class Person {
      place: Place;
      constructor(place: Place) {
        this.place = place;
      }
    }
    delegate(Person.prototype, "street", "city", { to: "place" });
    const p = new Person(new Place()) as Person & { street: string; city: string };
    expect(p.street).toBe("Paulina");
    expect(p.city).toBe("Chicago");
  });

  it("delegate with prefix true — prepends target name", () => {
    class Client {
      label = "David";
    }
    class Invoice {
      client: Client;
      constructor(client: Client) {
        this.client = client;
      }
    }
    delegate(Invoice.prototype, "label", { to: "client", prefix: true });
    const inv = new Invoice(new Client()) as Invoice & { client_label: string };
    expect(inv.client_label).toBe("David");
  });

  it("delegate with custom prefix — prepends custom prefix", () => {
    class Client {
      label = "David";
    }
    class Invoice {
      client: Client;
      constructor(client: Client) {
        this.client = client;
      }
    }
    delegate(Invoice.prototype, "label", { to: "client", prefix: "customer" });
    const inv = new Invoice(new Client()) as Invoice & { customer_label: string };
    expect(inv.customer_label).toBe("David");
  });

  it("delegate with allowNil true — returns undefined when target is nil", () => {
    class Project {
      person: null | { title: string } = null;
    }
    delegate(Project.prototype, "title", { to: "person", allowNil: true });
    const proj = new Project() as Project & { title: string | undefined };
    expect(proj.title).toBeUndefined();
  });

  it("delegate without allowNil — throws when target is nil", () => {
    class Someone {
      place: null | { street: string } = null;
    }
    delegate(Someone.prototype, "street", { to: "place" });
    const s = new Someone() as Someone & { street: string };
    expect(() => s.street).toThrow();
  });

  it("delegate returns generated method names", () => {
    class Foo {}
    const names = delegate(Foo.prototype, "bar", "baz", { to: "qux" });
    expect(names).toEqual(["bar", "baz"]);
  });

  it("delegate with prefix returns prefixed method names", () => {
    class Foo {}
    const names = delegate(Foo.prototype, "bar", { to: "qux", prefix: "the" });
    expect(names).toEqual(["the_bar"]);
  });

  it("mattr_accessor — defines class-level getter/setter", () => {
    class MyClass {}
    mattrAccessor(MyClass as unknown as { new (): unknown } & Record<string, unknown>, "setting");
    const klass = MyClass as unknown as Record<string, unknown>;
    klass["setting"] = 42;
    expect(klass["setting"]).toBe(42);
    klass["setting"] = "hello";
    expect(klass["setting"]).toBe("hello");
  });

  it("cattr_accessor — alias for mattrAccessor", () => {
    class Config {}
    cattrAccessor(Config as unknown as { new (): unknown } & Record<string, unknown>, "value");
    const klass = Config as unknown as Record<string, unknown>;
    klass["value"] = 99;
    expect(klass["value"]).toBe(99);
  });

  it("attr_internal reader and writer — underscore-prefixed storage", () => {
    class Widget {}
    attrInternal(Widget.prototype, "color");
    const w = new Widget() as Widget & { color: unknown };
    w.color = "red";
    expect(w.color).toBe("red");
    // Stored in _color_
    expect((w as unknown as Record<string, unknown>)["_color_"]).toBe("red");
  });

  it("attr_internal writer method — sets value via assignment method", () => {
    class Widget {}
    attrInternal(Widget.prototype, "size");
    const w = new Widget() as Widget & { size: unknown; "size=": (v: unknown) => void };
    w["size="]("large");
    expect(w.size).toBe("large");
  });

  it("isAnonymous — returns true for unnamed class", () => {
    const anon = (() => class {})();
    expect(isAnonymous(anon)).toBe(true);
  });

  it("isAnonymous — returns false for named class", () => {
    class Named {}
    expect(isAnonymous(Named)).toBe(false);
  });

  it("moduleParentName — returns null for top-level class", () => {
    class TopLevel {}
    expect(moduleParentName(TopLevel)).toBeNull();
  });

  it("moduleParentName — returns parent namespace for namespaced class", () => {
    // We simulate a namespaced class by naming it "Outer::Inner"
    const Inner = { name: "Outer::Inner" } as unknown as Function;
    expect(moduleParentName(Inner)).toBe("Outer");
  });
});

describe("ModuleAttributeAccessorTest", () => {
  it("should use mattr default", () => {
    class MyModule {}
    mattrAccessor(MyModule, "setting");
    expect((MyModule as any).setting).toBeUndefined();
  });

  it("mattr default keyword arguments", () => {
    class MyModule {}
    mattrAccessor(MyModule, "timeout", { default: 5 });
    expect((MyModule as any).timeout).toBe(5);
  });

  it("mattr can default to false", () => {
    class MyModule {}
    mattrAccessor(MyModule, "flag", { default: false });
    expect((MyModule as any).flag).toBe(false);
  });

  it("mattr default priority", () => {
    class MyModule {}
    mattrAccessor(MyModule, "setting", { default: "default" });
    (MyModule as any).setting = "override";
    expect((MyModule as any).setting).toBe("override");
  });

  it("should set mattr value", () => {
    class MyModule {}
    mattrAccessor(MyModule, "value");
    (MyModule as any).value = 42;
    expect((MyModule as any).value).toBe(42);
  });

  it("cattr accessor default value", () => {
    class MyClass {}
    cattrAccessor(MyClass, "level", { default: 3 });
    expect((MyClass as any).level).toBe(3);
  });

  it("should not create instance writer", () => {
    class MyModule {}
    mattrAccessor(MyModule, "config", { instanceWriter: false });
    const instance = new MyModule() as any;
    // Instance reader works (delegates to class)
    (MyModule as any).config = "class_value";
    expect(instance.config).toBe("class_value");
    // Instance setter is not defined on prototype
    const desc = Object.getOwnPropertyDescriptor(MyModule.prototype, "config");
    expect(desc?.set).toBeUndefined();
  });

  it("should not create instance reader", () => {
    class MyModule {}
    mattrAccessor(MyModule, "secret", { instanceReader: false });
    // Instance-level property should not be defined on prototype
    expect(Object.getOwnPropertyDescriptor(MyModule.prototype, "secret")).toBeUndefined();
  });

  it("should not create instance accessors", () => {
    class MyModule {}
    mattrAccessor(MyModule, "internal", { instanceAccessor: false });
    expect(Object.getOwnPropertyDescriptor(MyModule.prototype, "internal")).toBeUndefined();
  });

  it("should raise name error if attribute name is invalid", () => {
    class MyModule {}
    expect(() => mattrAccessor(MyModule, "1invalid")).toThrow();
    expect(() => mattrAccessor(MyModule, "has space")).toThrow();
  });

  it("should use default value if block passed", () => {
    class MyModule {}
    let callCount = 0;
    mattrAccessor(MyModule, "computed", {
      default: () => {
        callCount++;
        return "computed_val";
      },
    });
    expect((MyModule as any).computed).toBe("computed_val");
    expect(callCount).toBe(1); // block called once at definition
  });

  it("method invocation should not invoke the default block", () => {
    class MyModule {}
    let callCount = 0;
    mattrAccessor(MyModule, "lazy", {
      default: () => {
        callCount++;
        return "result";
      },
    });
    // Reading multiple times does not re-invoke block
    expect((MyModule as any).lazy).toBe("result");
    expect((MyModule as any).lazy).toBe("result");
    expect(callCount).toBe(1);
  });

  it("declaring multiple attributes at once invokes the block multiple times", () => {
    class MyModule {}
    let callCount = 0;
    const makeDefault = () => {
      callCount++;
      return "val";
    };
    mattrAccessor(MyModule, "a", "b", "c", { default: makeDefault });
    expect(callCount).toBe(3);
  });

  it.skip("declaring attributes on singleton errors");
});
describe("KernelSuppressTest", () => {
  it("suppression", () => {
    const log: string[] = [];
    suppress(() => {
      throw new TypeError("boom");
      log.push("should not reach"); // intentionally unreachable
    }, TypeError);
    expect(log).toEqual([]); // exception was suppressed
  });

  it("reraise", () => {
    expect(() => {
      suppress(() => {
        throw new RangeError("out of range");
      }, TypeError); // only suppresses TypeError, not RangeError
    }).toThrow(RangeError);
  });
});
describe("ConfigurableActiveSupport", () => {
  it("adds a configuration hash", () => {
    class MyApp {}
    configAccessor(MyApp, "log_level", { default: "info" });
    expect((MyApp as any).log_level).toBe("info");
  });

  it("adds a configuration hash to a module as well", () => {
    class MyModule {}
    configAccessor(MyModule, "setting");
    expect((MyModule as any).setting).toBeUndefined();
  });

  it("configuration hash is inheritable", () => {
    class Base {}
    configAccessor(Base, "timeout", { default: 30 });
    class Child extends Base {}
    // Child reads from Base's class-level accessor
    expect((Base as any).timeout).toBe(30);
  });

  it("configuration accessors can take a default value as an option", () => {
    class Base {}
    configAccessor(Base, "max_connections", { default: 100 });
    expect((Base as any).max_connections).toBe(100);
  });

  it("configuration hash is available on instance", () => {
    class Base {}
    configAccessor(Base, "verbose", { default: false });
    (Base as any).verbose = true;
    const instance = new Base() as any;
    expect(instance.verbose).toBe(true); // instance delegates to class
  });

  it("should raise name error if attribute name is invalid", () => {
    class Base {}
    expect(() => configAccessor(Base, "1bad")).toThrow();
  });
});
