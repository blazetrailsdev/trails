import { describe, expect, it } from "vitest";
import { ProtectedParams } from "./strong-parameters.js";

describe("ProtectedParams", () => {
  it("reads keys, key?, has_key? and empty? off the parameters", () => {
    const params = new ProtectedParams({ first_name: "Guille", gender: "m" });

    expect(params.keys()).toEqual(["first_name", "gender"]);
    expect(params.isKey("gender")).toBe(true);
    expect(params.isKey("last_name")).toBe(false);
    expect(params.hasKey("gender")).toBe(true);
    expect(params.isEmpty()).toBe(false);
    expect(new ProtectedParams().isEmpty()).toBe(true);
  });

  it("does not expose its own methods as parameters", () => {
    const params = new ProtectedParams({ first_name: "Guille" });

    expect(params.keys()).toEqual(["first_name"]);
    expect(params.isKey("permitted")).toBe(false);
    expect(params.toH()).toEqual({ first_name: "Guille" });
  });

  it("a parameter named after a method does not shadow the method", () => {
    const params = new ProtectedParams({
      keys: ["shadow"],
      permitted: true,
      toH: "not a method",
      first_name: "Guille",
    });

    expect(params.keys()).toEqual(["keys", "permitted", "toH", "first_name"]);
    expect(params.permitted()).toBe(false);
    expect(params.isEmpty()).toBe(false);
    expect(params.toH()).toEqual({
      keys: ["shadow"],
      permitted: true,
      toH: "not a method",
      first_name: "Guille",
    });
    expect(typeof params["keys"]).toBe("function");
    expect(params["first_name"]).toBe("Guille");
    expect({ ...params }.first_name).toBe("Guille");
  });

  it("permit! flips permitted? and returns self", () => {
    const params = new ProtectedParams({ first_name: "Guille" });

    expect(params.permitted()).toBe(false);
    expect(params.permitBang()).toBe(params);
    expect(params.permitted()).toBe(true);
  });

  it("to_unsafe_h returns to_h regardless of permitted?", () => {
    const params = new ProtectedParams({ first_name: "Guille" });

    expect(params.toUnsafeH()).toEqual({ first_name: "Guille" });
    expect(params.toUnsafeH()).toEqual(params.toH());
    expect(params.permitted()).toBe(false);
  });

  it("each_pair yields every parameter and returns self", () => {
    const params = new ProtectedParams({ first_name: "Guille", gender: "m" });
    const pairs: [string, unknown][] = [];

    expect(params.eachPair((key, value) => pairs.push([key, value]))).toBe(params);
    expect(pairs).toEqual([
      ["first_name", "Guille"],
      ["gender", "m"],
    ]);
  });

  it("dup preserves permitted? and copies the parameters", () => {
    const params = new ProtectedParams({ first_name: "Guille" });
    params.permitBang();

    const duplicate = params.dup();

    expect(duplicate).not.toBe(params);
    expect(duplicate.permitted()).toBe(true);
    expect(duplicate.toH()).toEqual({ first_name: "Guille" });

    duplicate["gender"] = "m";
    expect(params.toH()).toEqual({ first_name: "Guille" });
    expect(duplicate.toH()).toEqual({ first_name: "Guille", gender: "m" });
  });

  it("dup of an unpermitted params object stays unpermitted", () => {
    const duplicate = new ProtectedParams({ first_name: "Guille" }).dup();

    expect(duplicate.permitted()).toBe(false);
  });
});
