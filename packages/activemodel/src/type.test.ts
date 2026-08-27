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
    register("foo", (_name, args) => new type(args));

    expect(lookup("foo", { precision: 1 })).toEqual(new type({ precision: 1 }));
    expect(lookup("foo", {})).toEqual(new type({}));
  });
});
