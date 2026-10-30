import { describe, expect, it } from "vitest";
import { rbObjClone, rbObjDup } from "@blazetrails/ruby-compat";
import { TaskLib } from "./tasklib.js";

class Lib extends TaskLib {
  names = ["a"];
  raising = {
    initializeClone() {
      throw new TypeError("can't clone");
    },
  };
}

describe("Rake::Cloneable", () => {
  it("a dup does not share instance variable values", () => {
    const lib = new Lib();
    const copy = rbObjDup(lib);
    copy.names.push("b");
    expect(lib.names).toEqual(["a"]);
    expect(copy.names).toEqual(["a", "b"]);
  });

  it("a clone does not share instance variable values", () => {
    const lib = new Lib();
    expect(rbObjClone(lib).names).not.toBe(lib.names);
  });

  it("keeps the source value where clone raises", () => {
    const lib = new Lib();
    expect(rbObjDup(lib).raising).toBe(lib.raising);
  });
});
