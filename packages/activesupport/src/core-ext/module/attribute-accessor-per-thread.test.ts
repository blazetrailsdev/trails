import { beforeEach, describe, expect, it } from "vitest";
import { NameError, Thread } from "@blazetrails/ruby-compat";
import {
  threadCattrReader,
  threadCattrWriter,
  threadMattrAccessor,
  threadMattrReader,
  threadMattrWriter,
} from "./attribute-accessors-per-thread.js";
import {
  assertNotPredicate,
  assertNotRespondTo,
  assertPredicate,
  assertRaises,
  assertRespondTo,
  assertSame,
  assertNil,
} from "../../testing/assertions.js";

describe("ModuleAttributeAccessorPerThreadTest", () => {
  let klass: any;
  let subclass: any;
  let object: any;

  beforeEach(() => {
    klass = class {};
    threadMattrAccessor.call(klass, "foo");
    threadMattrAccessor.call(klass, "bar", { instanceWriter: false });
    threadMattrReader.call(klass, "shaq", { instanceReader: false });
    threadMattrAccessor.call(klass, "camp", { instanceAccessor: false });

    subclass = class extends klass {};

    object = new klass();
  });

  it("default value", () => {
    threadMattrAccessor.call(klass, "baz", { default: "default_value" });

    expect(klass.baz).toEqual("default_value");
  });

  it("default value is accessible from subclasses", () => {
    threadMattrAccessor.call(klass, "baz", { default: "default_value" });

    expect(subclass.baz).toEqual("default_value");
  });

  it("default value is accessible from other threads", () => {
    threadMattrAccessor.call(klass, "baz", { default: "default_value" });

    new Thread(() => {
      expect(klass.baz).toEqual("default_value");
    }).join();
  });

  it("nonfrozen default value is duped and frozen", () => {
    const _default: unknown[] = [];
    threadMattrAccessor.call(klass, "baz", { default: _default });

    expect(klass.baz).toEqual(_default);
    assertPredicate(klass.baz, Object.isFrozen);
    assertNotPredicate(_default, Object.isFrozen);
  });

  it("frozen default value is not duped", () => {
    const _default = Object.freeze([]);
    threadMattrAccessor.call(klass, "baz", { default: _default });

    assertSame(_default, klass.baz);
  });

  it("should use mattr default", () => {
    new Thread(() => {
      assertNil(klass.foo);
      assertNil(object.foo);
    }).join();
  });

  it("should set mattr value", () => {
    new Thread(() => {
      klass.foo = "test";
      expect(klass.foo).toEqual("test");

      klass.foo = "test2";
      expect(klass.foo).toEqual("test2");
    }).join();
  });

  it("should not create instance writer", () => {
    new Thread(() => {
      assertRespondTo(klass, "foo");
      assertRespondTo(klass, "foo=");
      assertRespondTo(object, "bar");
      assertNotRespondTo(object, "bar=");
    }).join();
  });

  it("should not create instance reader", () => {
    new Thread(() => {
      assertRespondTo(klass, "shaq");
      assertNotRespondTo(object, "shaq");
    }).join();
  });

  it("should not create instance accessors", () => {
    new Thread(() => {
      assertRespondTo(klass, "camp");
      assertNotRespondTo(object, "camp");
      assertNotRespondTo(object, "camp=");
    }).join();
  });

  it("should raise name error if attribute name is invalid", async () => {
    let exception = await assertRaises([NameError], {}, () =>
      threadCattrReader.call(class {}, "1nvalid"),
    );
    expect(exception.message).toMatch("invalid attribute name: 1nvalid");

    exception = await assertRaises([NameError], {}, () =>
      threadCattrWriter.call(class {}, "1nvalid"),
    );
    expect(exception.message).toMatch("invalid attribute name: 1nvalid");

    exception = await assertRaises([NameError], {}, () =>
      threadMattrReader.call(class {}, "1valid_part"),
    );
    expect(exception.message).toMatch("invalid attribute name: 1valid_part");

    exception = await assertRaises([NameError], {}, () =>
      threadMattrWriter.call(class {}, "2valid_part"),
    );
    expect(exception.message).toMatch("invalid attribute name: 2valid_part");
  });

  it("should return same value by class or instance accessor", () => {
    klass.foo = "fries";

    expect(object.foo).toEqual(klass.foo);
  });

  it("should not affect superclass if subclass set value", () => {
    klass.foo = "super";
    expect(klass.foo).toEqual("super");
    assertNil(subclass.foo);

    subclass.foo = "sub";
    expect(klass.foo).toEqual("super");
    expect(subclass.foo).toEqual("sub");
  });

  it("superclass keeps default value when value set on subclass", () => {
    threadMattrAccessor.call(klass, "baz", { default: "default_value" });
    subclass.baz = "sub";

    expect(klass.baz).toEqual("default_value");
    expect(subclass.baz).toEqual("sub");
  });

  it("subclass keeps default value when value set on superclass", () => {
    threadMattrAccessor.call(klass, "baz", { default: "default_value" });
    klass.baz = "super";

    expect(klass.baz).toEqual("super");
    expect(subclass.baz).toEqual("default_value");
  });

  it("subclass can override default value without affecting superclass", () => {
    threadMattrAccessor.call(klass, "baz", { default: "super" });
    threadMattrAccessor.call(subclass, "baz", { default: "sub" });

    expect(klass.baz).toEqual("super");
    expect(subclass.baz).toEqual("sub");
  });
});
