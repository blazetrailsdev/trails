import { describe, it, expect } from "vitest";
import { Types } from "./index.js";
import { register, lookup } from "./type.js";

describe("TypeTest", () => {
  it("registering a new type", () => {
    class type extends Types.ValueType {
      constructor(readonly args: unknown) {
        super();
      }
    }
    register("foo", type);

    expect(lookup("foo", ":arg")).toEqual(new type(":arg"));
    expect(lookup("foo", {})).toEqual(new type({}));
  });
});
