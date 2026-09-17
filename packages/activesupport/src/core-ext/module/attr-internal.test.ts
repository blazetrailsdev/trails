import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  attrInternal,
  attrInternalAccessor,
  attrInternalReader,
  attrInternalWriter,
  getAttrInternalNamingFormat,
  setAttrInternalNamingFormat,
} from "../../module-ext.js";
import { assert, assertNot } from "../../testing/assertions.js";

describe("AttrInternalTest", () => {
  let savedFormat: string;

  beforeEach(() => {
    savedFormat = getAttrInternalNamingFormat();
  });

  afterEach(() => {
    setAttrInternalNamingFormat(savedFormat);
  });

  it("reader", () => {
    class Target {}
    const instance = new Target() as any;
    expect(() => attrInternalReader.call(Target.prototype, "foo")).not.toThrow();

    assertNot("_foo" in instance);
    expect(() => {
      instance.foo = 1;
    }).toThrow();

    instance._foo = 1;
    expect(() => expect(instance.foo).toEqual(1)).not.toThrow();
  });

  it("writer", () => {
    class Target {}
    const instance = new Target() as any;
    expect(() => attrInternalWriter.call(Target.prototype, "foo")).not.toThrow();

    assertNot("_foo" in instance);
    expect(() => expect((instance.foo = 1)).toEqual(1)).not.toThrow();

    expect(instance._foo).toEqual(1);
    expect(() => instance.foo()).toThrow(TypeError);
  });

  it("accessor", () => {
    class Target {}
    const instance = new Target() as any;
    expect(() => attrInternalAccessor.call(Target.prototype, "foo")).not.toThrow();

    assertNot("_foo" in instance);
    expect(() => expect((instance.foo = 1)).toEqual(1)).not.toThrow();

    expect(instance._foo).toEqual(1);
    expect(() => expect(instance.foo).toEqual(1)).not.toThrow();
  });

  it("invalid naming format", () => {
    expect(getAttrInternalNamingFormat()).toBe("_%s");
    expect(() => {
      setAttrInternalNamingFormat("@___%s");
    }).toThrow();
  });

  it("naming format", () => {
    expect(() => setAttrInternalNamingFormat("abc%sdef")).not.toThrow();
    class Target {}
    attrInternal.call(Target.prototype, "foo");
    const instance = new Target() as any;

    assertNot("_foo" in instance);
    assertNot("abcfoodef" in instance);
    expect(() => {
      instance.foo = 1;
    }).not.toThrow();
    assertNot("_foo" in instance);
    assert("abcfoodef" in instance);
  });

  it("attrInternal is an alias of attrInternalAccessor", () => {
    expect(attrInternal).toBe(attrInternalAccessor);
  });
});
