import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  attrInternal,
  attrInternalAccessor,
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
    attrInternalReader.call(Target.prototype, "foo");
    const instance = new Target() as any;

    expect(instance._foo).toBeUndefined();
    expect(() => {
      instance.foo = 1;
    }).toThrow();

    instance._foo = 1;
    expect(instance.foo).toBe(1);
  });

  it("writer", () => {
    class Target {}
    attrInternalWriter.call(Target.prototype, "foo");
    const instance = new Target() as any;

    expect(instance._foo).toBeUndefined();
    instance.foo = 1;
    expect(instance._foo).toBe(1);
    expect(instance.foo).toBeUndefined();
  });

  it("accessor", () => {
    class Target {}
    attrInternalAccessor.call(Target.prototype, "foo");
    const instance = new Target() as any;

    expect(instance._foo).toBeUndefined();
    instance.foo = 1;
    expect(instance._foo).toBe(1);
    expect(instance.foo).toBe(1);
  });

  it("invalid naming format", () => {
    expect(getAttrInternalNamingFormat()).toBe("_%s");
    expect(() => {
      setAttrInternalNamingFormat("@___%s");
    }).toThrow();
  });

  it("naming format", () => {
    setAttrInternalNamingFormat("abc%sdef");
    class Target {}
    attrInternal.call(Target.prototype, "foo");
    const instance = new Target() as any;

    expect(instance._foo).toBeUndefined();
    expect(instance.abcfoodef).toBeUndefined();
    instance.foo = 1;
    expect(instance._foo).toBeUndefined();
    expect(instance.abcfoodef).toBe(1);
  });

  it("attrInternal is an alias of attrInternalAccessor", () => {
    expect(attrInternal).toBe(attrInternalAccessor);
  });
});
