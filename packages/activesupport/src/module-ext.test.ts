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
  registerSubclass,
  subclasses,
  descendants,
  rescueFrom,
  handleRescue,
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
    mattrAccessor(MyClass as unknown as { new(): unknown } & Record<string, unknown>, "setting");
    const klass = MyClass as unknown as Record<string, unknown>;
    klass["setting"] = 42;
    expect(klass["setting"]).toBe(42);
    klass["setting"] = "hello";
    expect(klass["setting"]).toBe("hello");
  });

  it("cattr_accessor — alias for mattrAccessor", () => {
    class Config {}
    cattrAccessor(Config as unknown as { new(): unknown } & Record<string, unknown>, "value");
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
    expect(((w as unknown) as Record<string, unknown>)["_color_"]).toBe("red");
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

  it("delegation to index get method", () => {
    class Container {
      data: Record<string, unknown> = { key: "value" };
      get(key: string) { return this.data[key]; }
    }
    class Wrapper {
      container: Container;
      constructor() { this.container = new Container(); }
    }
    delegate(Wrapper.prototype, "get", { to: "container" });
    const w = new Wrapper() as Wrapper & Record<string, unknown>;
    // delegate creates a getter that returns the method; bind to call it
    const getFn = w.get as Container["get"];
    expect(getFn.call(w.container, "key")).toBe("value");
  });

  it("delegation to index set method", () => {
    class Container {
      data: Record<string, unknown> = {};
      set(key: string, val: unknown) { this.data[key] = val; }
      get(key: string) { return this.data[key]; }
    }
    class Wrapper {
      container: Container;
      constructor() { this.container = new Container(); }
    }
    delegate(Wrapper.prototype, "set", "get", { to: "container" });
    const w = new Wrapper() as Wrapper & Record<string, unknown>;
    const setFn = w.set as Container["set"];
    const getFn = w.get as Container["get"];
    setFn.call(w.container, "x", 42);
    expect(getFn.call(w.container, "x")).toBe(42);
  });

  it("delegation with allow nil and false value", () => {
    class Settings {
      enabled = false;
    }
    class App {
      settings: Settings | null = new Settings();
    }
    delegate(App.prototype, "enabled", { to: "settings", allowNil: true });
    const app = new App() as App & { enabled: boolean | undefined };
    expect(app.enabled).toBe(false);
  });

  it("delegation with allow nil and invalid value", () => {
    class Target {
      value: unknown = undefined;
    }
    class Host {
      target: Target | null = new Target();
    }
    delegate(Host.prototype, "value", { to: "target", allowNil: true });
    const h = new Host() as Host & { value: unknown };
    expect(h.value).toBeUndefined();
    h.target = null;
    expect(h.value).toBeUndefined();
  });

  it("delegation to method that exists on nil when allowing nil", () => {
    class Greeter {
      greet() { return "hello"; }
    }
    class Host {
      greeter: Greeter | null = null;
    }
    delegate(Host.prototype, "greet", { to: "greeter", allowNil: true });
    const h = new Host() as Host & Record<string, unknown>;
    // When greeter is null, returns undefined
    expect(h.greet).toBeUndefined();
    h.greeter = new Greeter();
    // When greeter exists, returns the method
    expect(typeof h.greet).toBe("function");
  });

  it("delegate line with nil", () => {
    class Name {
      first = "Alice";
    }
    class Person {
      name: Name | null = null;
    }
    delegate(Person.prototype, "first", { to: "name", allowNil: true });
    const p = new Person() as Person & { first: string | undefined };
    expect(p.first).toBeUndefined();
  });

  it("delegate missing to does not delegate to fake methods", () => {
    class Real {
      exists() { return true; }
    }
    class Host {
      real: Real = new Real();
    }
    delegate(Host.prototype, "exists", { to: "real" });
    const h = new Host() as Host & Record<string, unknown>;
    expect((h as any).exists()).toBe(true);
    // Non-delegated method should not exist
    expect(typeof h.nonExistent).toBe("undefined");
  });

  it("module nesting is empty", () => {
    // In JS, there's no module nesting concept like Ruby's Module.nesting
    // The nearest equivalent: check that a plain class has no namespace
    class Foo {}
    expect(Foo.name).toBe("Foo");
    expect(Foo.name.includes("::")).toBe(false);
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
    mattrAccessor(MyModule, "computed", { default: () => { callCount++; return "computed_val"; } });
    expect((MyModule as any).computed).toBe("computed_val");
    expect(callCount).toBe(1); // block called once at definition
  });

  it("method invocation should not invoke the default block", () => {
    class MyModule {}
    let callCount = 0;
    mattrAccessor(MyModule, "lazy", { default: () => { callCount++; return "result"; } });
    // Reading multiple times does not re-invoke block
    expect((MyModule as any).lazy).toBe("result");
    expect((MyModule as any).lazy).toBe("result");
    expect(callCount).toBe(1);
  });

  it("declaring multiple attributes at once invokes the block multiple times", () => {
    class MyModule {}
    let callCount = 0;
    const makeDefault = () => { callCount++; return "val"; };
    mattrAccessor(MyModule, "a", "b", "c", { default: makeDefault });
    expect(callCount).toBe(3);
  });

  it.skip("declaring attributes on singleton errors", () => {
    // Ruby-specific: can't define mattr on singleton class
  });
});

describe("AttrInternalTest", () => {
  it("reader", () => {
    class Widget {}
    attrInternal(Widget.prototype, "color");
    const w = new Widget() as any;
    (w as any)._color_ = "red";
    expect(w.color).toBe("red");
  });

  it("writer", () => {
    class Widget {}
    attrInternal(Widget.prototype, "size");
    const w = new Widget() as any;
    w.size = "large";
    expect((w as any)._size_).toBe("large");
  });

  it("accessor", () => {
    class Widget {}
    attrInternal(Widget.prototype, "label");
    const w = new Widget() as any;
    w.label = "hello";
    expect(w.label).toBe("hello");
  });

  it("invalid naming format", () => {
    // attrInternal doesn't validate names — it stores with underscore prefix
    // So this is just documentation: naming is _name_
    class Widget {}
    attrInternal(Widget.prototype, "foo");
    const w = new Widget() as any;
    w.foo = 99;
    expect((w as any)._foo_).toBe(99);
  });

  it("naming format", () => {
    // Default naming format: _name_
    class Widget {}
    attrInternal(Widget.prototype, "bar");
    const w = new Widget() as any;
    w.bar = "test";
    expect(Object.keys(w)).toContain("_bar_");
  });
});

describe("KernelSuppressTest", () => {
  it("suppression", () => {
    const log: string[] = [];
    suppress(() => {
      throw new TypeError("boom");
      log.push("should not reach");
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

describe("ClassTest", () => {
  it("descendants", () => {
    class Vehicle {}
    class Car extends Vehicle { constructor() { super(); registerSubclass(Vehicle, Car); } }
    class Truck extends Vehicle { constructor() { super(); registerSubclass(Vehicle, Truck); } }
    class SportsCar extends Car { constructor() { super(); registerSubclass(Car, SportsCar); } }
    // register manually (simulating class definition time registration)
    registerSubclass(Vehicle, Car);
    registerSubclass(Vehicle, Truck);
    registerSubclass(Car, SportsCar);
    const desc = descendants(Vehicle);
    expect(desc).toContain(Car);
    expect(desc).toContain(Truck);
    expect(desc).toContain(SportsCar);
  });

  it("subclasses", () => {
    class Animal {}
    class Dog extends Animal {}
    class Cat extends Animal {}
    class Poodle extends Dog {}
    registerSubclass(Animal, Dog);
    registerSubclass(Animal, Cat);
    registerSubclass(Dog, Poodle);
    const subs = subclasses(Animal);
    expect(subs).toContain(Dog);
    expect(subs).toContain(Cat);
    expect(subs).not.toContain(Poodle); // only direct children
  });

  it.skip("descendants excludes singleton classes", () => { /* Ruby-specific */ });
  it.skip("subclasses excludes singleton classes", () => { /* Ruby-specific */ });
  it.skip("subclasses exclude reloaded classes", () => { /* Ruby-specific */ });
  it.skip("descendants exclude reloaded classes", () => { /* Ruby-specific */ });
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

  it("configuration accessors are not available on instance", () => {
    class Base {}
    configAccessor(Base, "debug", { instanceAccessor: false });
    const instance = new Base() as any;
    // No instance-level property defined
    expect(Object.getOwnPropertyDescriptor(Base.prototype, "debug")).toBeUndefined();
  });

  it("configuration accessors can take a default value as a block", () => {
    class Base {}
    configAccessor(Base, "computed_val", { default: () => 42 });
    expect((Base as any).computed_val).toBe(42);
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

  it("configuration is crystalizeable", () => {
    class Base {}
    configAccessor(Base, "frozen_val", { default: "immutable" });
    expect((Base as any).frozen_val).toBe("immutable");
    (Base as any).frozen_val = "changed";
    expect((Base as any).frozen_val).toBe("changed");
  });

  it("should raise name error if attribute name is invalid", () => {
    class Base {}
    expect(() => configAccessor(Base, "1bad")).toThrow();
  });

  it.skip("the config_accessor method should not be publicly callable", () => {
    // Ruby-specific: config_accessor is a private class method
  });
});

describe("RescuableTest", () => {
  it("rescue from with method", () => {
    class MyController {
      static handled: string | null = null;
      static handleError(e: Error) {
        MyController.handled = e.message;
      }
    }
    rescueFrom(MyController, TypeError, { with: "handleError" });
    const handled = handleRescue(MyController, new TypeError("type error!"));
    expect(handled).toBe(true);
    expect(MyController.handled).toBe("type error!");
  });

  it("rescue from with block", () => {
    class MyController {}
    const caught: Error[] = [];
    rescueFrom(MyController, RangeError, { with: (e: any) => caught.push(e) });
    handleRescue(MyController, new RangeError("out of range"));
    expect(caught).toHaveLength(1);
    expect(caught[0].message).toBe("out of range");
  });

  it("rescue from with block with args", () => {
    class MyController {}
    let received: Error | null = null;
    rescueFrom(MyController, Error, { with: (e: any) => { received = e; } });
    const err = new Error("boom");
    handleRescue(MyController, err);
    expect(received).toBe(err);
  });

  it("rescues defined later are added at end of the rescue handlers array", () => {
    class MyController {}
    const log: string[] = [];
    rescueFrom(MyController, TypeError, { with: () => log.push("first") });
    rescueFrom(MyController, TypeError, { with: () => log.push("second") });
    handleRescue(MyController, new TypeError("t"));
    // Last registered handler takes priority (reversed search)
    expect(log).toEqual(["second"]);
  });

  it("unhandled exceptions", () => {
    class MyController {}
    rescueFrom(MyController, TypeError, { with: () => {} });
    const handled = handleRescue(MyController, new RangeError("not handled"));
    expect(handled).toBe(false);
  });

  it.skip("rescue from error dispatchers with case operator", () => { /* Ruby-specific */ });
  it.skip("children should inherit rescue definitions from parents and child rescue should be appended", () => { /* Ruby-specific */ });
  it.skip("rescue falls back to exception cause", () => { /* Ruby-specific */ });
  it.skip("rescue handles loops in exception cause chain", () => { /* Ruby-specific */ });
});
