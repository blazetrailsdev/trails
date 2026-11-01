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
    expect(newCref().cname).toEqual("Foo");
  });

  it("#path for Object", () => {
    expect(newCref(Object).path()).toEqual("Foo");
  });

  it("#path for another namespace", () => {
    expect(newCref().path()).toEqual(`${rbModName(klass)}::Foo`);
  });

  it("#to_s is #path", () => {
    expect(Cref.prototype.toString).toBe(Cref.prototype.path);
  });

  it.skip("#autoload?", () => {});
  it.skip("#autoload", () => {});

  it("#defined? finds a constant defined in mod", () => {
    constSet(klass, "Foo", 1);
    expect(newCref().isDefined()).toBeTruthy();
  });

  it("#defined? ignores the ancestors", () => {
    const cname = "TMP_DIR";
    expect(cname in Object.getPrototypeOf(klass)).toBeTruthy();
    expect(!newCref(klass, cname).isDefined()).toBeTruthy();
  });

  it("#set", () => {
    expect(newCref().set(1)).toEqual(1);
    expect((klass as unknown as { Foo: number }).Foo).toEqual(1);
  });

  it("#get", () => {
    constSet(klass, "Foo", 1);
    expect(newCref().get()).toEqual(1);
  });

  it("#get with unknown cname", () => {
    expect(() => newCref().get()).toThrow("uninitialized constant");
  });

  it("#remove", () => {
    const cref = newCref();

    cref.set(1);
    expect(cref.isDefined()).toBeTruthy();

    cref.remove();
    expect(!cref.isDefined()).toBeTruthy();
  });

  it("#remove with unknown cname", () => {
    expect(() => newCref().remove()).toThrow("not defined");
  });
});
