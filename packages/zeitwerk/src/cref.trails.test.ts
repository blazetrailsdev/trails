import { File, TopLevel, constSet } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Cref } from "./cref.js";
import { Map } from "./cref/map.js";
import { newLoader, teardown } from "./test-helpers/loader-test.js";

describe("Zeitwerk::Cref on Object", () => {
  it("seats on TopLevel, keeps Object as mod, and is found by Map#delete_mod_cname", () => {
    const cref = new Cref(Object, "ZeitwerkTopLevelSeat");
    const map = new Map<number>();
    map.set(cref, 1);
    expect(cref.mod).toBe(Object);
    expect(map.deleteModCname(Object, "ZeitwerkTopLevelSeat")).toBe(1);

    cref.set(1);
    expect(cref.isDefined()).toBe(true);
    expect(cref.get()).toBe(1);
    cref.remove();
    expect(cref.isDefined()).toBe(false);
    expect(() => cref.get()).toThrow("uninitialized constant ZeitwerkTopLevelSeat");
    expect(() => cref.remove()).toThrow("constant Object::ZeitwerkTopLevelSeat not defined");
  });

  it("paths an anonymous namespace as Ruby interpolates nil", () => {
    expect(new Cref(class {}, "X").path()).toBe("::X");
  });

  it("push_dir accepts a plain-object module", async () => {
    const loader = newLoader();
    const mod = {};
    constSet(TopLevel, "ZeitwerkPlainNamespace", mod);
    await loader.pushDir(".", { namespace: mod });
    expect(loader.roots[File.expandPath(".")]).toBe(mod);
    teardown();
  });
});
