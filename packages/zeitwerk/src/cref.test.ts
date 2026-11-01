import { TopLevel, constSet, rbModName, registerConstant } from "@blazetrails/ruby-compat";
import { afterEach, describe, expect, it } from "vitest";
import { Cref } from "./cref.js";

class LoaderTest {
  static TMP_DIR = "/tmp";
}

describe("TestCref", () => {
  class klass extends LoaderTest {}
  registerConstant("TestCref", klass);

  const newCref = (mod: object = klass, cname = "Foo") => new Cref(mod, cname);

  afterEach(() => {
    delete (klass as unknown as Record<string, unknown>).Foo;
    delete (TopLevel as Record<string, unknown>).Foo;
  });

  it("#cname", () => {
    expect(newCref().cname).toBe("Foo");
  });

  it("#path for Object", () => {
    expect(newCref(Object).path()).toBe("Foo");
  });

  it("#path for another namespace", () => {
    expect(newCref().path()).toBe(`${rbModName(klass)}::Foo`);
  });

  it("#to_s is #path", () => {
    expect(Cref.prototype.toString).toBe(Cref.prototype.path);
  });

  it.skip("#autoload?", () => {});
  it.skip("#autoload", () => {});

  it("#defined? finds a constant defined in mod", () => {
    constSet(klass, "Foo", 1);
    expect(newCref().isDefined()).toBe(true);
  });

  it("#defined? ignores the ancestors", () => {
    const cname = "TMP_DIR";
    expect(cname in Object.getPrototypeOf(klass)).toBe(true);
    expect(newCref(klass, cname).isDefined()).toBe(false);
  });

  it("#set", () => {
    expect(newCref().set(1)).toBe(1);
    expect((klass as unknown as { Foo: number }).Foo).toBe(1);
  });

  it("#get", () => {
    constSet(klass, "Foo", 1);
    expect(newCref().get()).toBe(1);
  });

  it("#get with unknown cname", () => {
    expect(() => newCref().get()).toThrow("uninitialized constant");
  });

  it("#remove", () => {
    const cref = newCref();

    cref.set(1);
    expect(cref.isDefined()).toBe(true);

    cref.remove();
    expect(cref.isDefined()).toBe(false);
  });

  it("#remove with unknown cname", () => {
    expect(() => newCref().remove()).toThrow("not defined");
  });
});
