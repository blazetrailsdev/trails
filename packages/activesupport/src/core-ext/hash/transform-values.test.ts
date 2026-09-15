import { describe, expect, it } from "vitest";
import { withIndifferentAccess } from "./indifferent-access.js";

describe("IndifferentTransformValuesTest", () => {
  it("indifferent access is still indifferent after mapping values", () => {
    const original = withIndifferentAccess({ a: "a", b: "b" });
    const mapped = original.transformValues((v) => (v as string) + "!");

    expect(mapped.get("a")).toEqual("a!");
    expect(mapped.get("a")).toEqual("a!");
  });
});
