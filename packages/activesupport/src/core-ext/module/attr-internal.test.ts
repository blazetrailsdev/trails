import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  attrInternal,
  attrInternalReader,
  attrInternalWriter,
  getAttrInternalNamingFormat,
  setAttrInternalNamingFormat,
} from "../../module-ext.js";

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
    attrInternalReader(Target.prototype, "foo");
    const instance = new Target() as any;

    expect(instance._foo_).toBeUndefined();
    expect(() => {
      instance.foo = 1;
    }).toThrow();

    instance._foo_ = 1;
    expect(instance.foo).toBe(1);
  });

  it("writer", () => {
    class Target {}
    attrInternalWriter(Target.prototype, "foo");
    const instance = new Target() as any;

    expect(instance._foo_).toBeUndefined();
    instance.foo = 1;
    expect(instance._foo_).toBe(1);
    // In JS, accessing a setter-only property returns undefined (not an error like Ruby's NoMethodError)
    expect(instance.foo).toBeUndefined();
  });

  it("accessor", () => {
    class Target {}
    attrInternal(Target.prototype, "foo");
    const instance = new Target() as any;

    expect(instance._foo_).toBeUndefined();
    instance.foo = 1;
    expect(instance._foo_).toBe(1);
    expect(instance.foo).toBe(1);
  });

  it("invalid naming format", () => {
    expect(getAttrInternalNamingFormat()).toBe("_%s_");
    expect(() => {
      setAttrInternalNamingFormat("@___%s");
    }).toThrow();
  });

  it("naming format", () => {
    setAttrInternalNamingFormat("abc%sdef");
    class Target {}
    attrInternal(Target.prototype, "foo");
    const instance = new Target() as any;

    expect(instance._foo_).toBeUndefined();
    expect(instance.abcfoodef).toBeUndefined();
    instance.foo = 1;
    expect(instance._foo_).toBeUndefined();
    expect(instance.abcfoodef).toBe(1);
  });
});
