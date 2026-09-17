import { beforeEach, describe, it, expect } from "vitest";
import { NameError } from "@blazetrails/ruby-compat";

import {
  cattrAccessor,
  cattrReader,
  cattrWriter,
  mattrAccessor,
  mattrReader,
  mattrWriter,
} from "../../module-ext.js";
import {
  assertNoDifference,
  assertNotRespondTo,
  assertRaises,
  assertRespondTo,
} from "../../testing/assertions.js";

describe("ModuleAttributeAccessorTest", () => {
  let module: any;
  let object: any;

  beforeEach(() => {
    const m = (module = class {});
    mattrAccessor.call(m, "foo");
    mattrAccessor.call(m, "bar", { instanceWriter: false });
    mattrReader.call(m, "shaq", { instanceReader: false });
    mattrAccessor.call(m, "camp", { instanceAccessor: false });

    cattrAccessor.call(m, "defa", { default: () => "default_accessor_value" });
    cattrReader.call(m, "defr", { default: () => "default_reader_value" });
    cattrWriter.call(m, "defw", { default: () => "default_writer_value" });
    cattrAccessor.call(m, "deff", { default: () => false });
    cattrAccessor.call(m, "quux", { default: () => "quux" });

    cattrAccessor.call(m, "defAccessor", { default: "default_accessor_value" });
    cattrReader.call(m, "defReader", { default: "default_reader_value" });
    cattrWriter.call(m, "defWriter", { default: "default_writer_value" });
    cattrAccessor.call(m, "defFalse", { default: false });
    cattrAccessor.call(m, "defPriority", { default: false });
    object = new m();
  });

  it("should use mattr default", () => {
    expect(module.foo).toBeUndefined();
    expect(object.foo).toBeUndefined();
  });

  it("mattr default keyword arguments", () => {
    expect(module.defAccessor).toEqual("default_accessor_value");
    expect(module.defReader).toEqual("default_reader_value");
    expect(module.__mattr_defWriter__).toEqual("default_writer_value");
  });

  it("mattr can default to false", () => {
    expect(module.defFalse).toEqual(false);
    expect(module.deff).toEqual(false);
  });

  it("mattr default priority", () => {
    expect(module.defPriority).toEqual(false);
  });

  it("should set mattr value", () => {
    module.foo = "test";
    expect(object.foo).toEqual("test");

    object.foo = "test2";
    expect(module.foo).toEqual("test2");
  });

  it("cattr accessor default value", () => {
    expect(module.quux).toEqual("quux");
    expect(object.quux).toEqual("quux");
  });

  it("should not create instance writer", () => {
    assertRespondTo(module, "foo");
    assertRespondTo(module, "foo=");
    assertRespondTo(object, "bar");
    assertNotRespondTo(object, "bar=");
  });

  it("should not create instance reader", () => {
    assertRespondTo(module, "shaq");
    assertNotRespondTo(object, "shaq");
  });

  it("should not create instance accessors", () => {
    assertRespondTo(module, "camp");
    assertNotRespondTo(object, "camp");
    assertNotRespondTo(object, "camp=");
  });

  it("should raise name error if attribute name is invalid", async () => {
    let exception = await assertRaises([NameError], {}, () =>
      cattrReader.call(class {}, "1nvalid"),
    );
    expect(exception.message).toMatch("invalid attribute name: 1nvalid");

    exception = await assertRaises([NameError], {}, () => cattrWriter.call(class {}, "1nvalid"));
    expect(exception.message).toMatch("invalid attribute name: 1nvalid");

    exception = await assertRaises([NameError], {}, () =>
      mattrReader.call(class {}, "valid_part\ninvalid_part"),
    );
    expect(exception.message).toMatch("invalid attribute name: valid_part\ninvalid_part");

    exception = await assertRaises([NameError], {}, () =>
      mattrWriter.call(class {}, "valid_part\ninvalid_part"),
    );
    expect(exception.message).toMatch("invalid attribute name: valid_part\ninvalid_part");
  });

  it("should use default value if block passed", () => {
    expect(module.defa).toEqual("default_accessor_value");
    expect(module.defr).toEqual("default_reader_value");
    expect(module.__mattr_defw__).toEqual("default_writer_value");
  });

  it("method invocation should not invoke the default block", async () => {
    let count = 0;

    cattrAccessor.call(module, "defcount", { default: () => (count += 1) });

    expect(count).toEqual(1);
    await assertNoDifference(
      () => count,
      null,
      () => module.defcount,
    );
  });

  it("declaring multiple attributes at once invokes the block multiple times", () => {
    let count = 0;

    cattrAccessor.call(module, "defn1", "defn2", { default: () => (count += 1) });

    expect(module.defn1).toEqual(1);
    expect(module.defn2).toEqual(2);
  });
});
