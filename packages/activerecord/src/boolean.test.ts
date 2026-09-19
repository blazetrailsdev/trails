import { describe, it, expect } from "vitest";
import { BooleanType } from "@blazetrails/activemodel";
import { Boolean } from "./test-helpers/models/boolean.js";
import { fixtures } from "./test-fixtures.js";

fixtures({ booleans: [Boolean, {}] });

describe("BooleanTest", () => {
  it("boolean", async () => {
    const b_nil = await Boolean.createBang({ value: null });
    const b_false = await Boolean.createBang({ value: false });
    const b_true = await Boolean.createBang({ value: true });

    expect((await Boolean.find(b_nil.id)).value).toBeNull();
    expect((await Boolean.find(b_false.id)).queryAttribute("value")).toBeFalsy();
    expect((await Boolean.find(b_true.id)).queryAttribute("value")).toBeTruthy();
  });

  it("boolean without questionmark", async () => {
    const b_true = await Boolean.createBang({ value: true });

    const subclass = await class extends Boolean {}.find(b_true.id);
    const superclass = await Boolean.find(b_true.id);

    expect(subclass.readAttribute("has_fun")).toEqual(superclass.readAttribute("has_fun"));
  });

  it("boolean cast from string", async () => {
    const b_blank = await Boolean.createBang({ value: "" });
    const b_false = await Boolean.createBang({ value: "0" });
    const b_true = await Boolean.createBang({ value: "1" });

    expect((await Boolean.find(b_blank.id)).value).toBeNull();
    expect((await Boolean.find(b_false.id)).queryAttribute("value")).toBeFalsy();
    expect((await Boolean.find(b_true.id)).queryAttribute("value")).toBeTruthy();
  });

  it("find by boolean string", async () => {
    const b_false = await Boolean.createBang({ value: "false" });
    const b_true = await Boolean.createBang({ value: "true" });

    expect((await Boolean.findBy({ value: "false" }))!.id).toEqual(b_false.id);
    expect((await Boolean.findBy({ value: "true" }))!.id).toEqual(b_true.id);
  });

  it("find by falsy boolean symbol", async () => {
    for (const value of BooleanType.FALSE_VALUES) {
      const b_false = await Boolean.createBang({ value });

      expect(b_false.queryAttribute("value")).toBeFalsy();
      expect((await Boolean.findBy({ id: b_false.id, value: String(value) }))!.id).toEqual(
        b_false.id,
      );
    }
  });
});
