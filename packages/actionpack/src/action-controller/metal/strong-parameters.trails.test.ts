import { describe, it, expect } from "vitest";
import { Parameters, UnpermittedParameters } from "./strong-parameters.js";

describe("Parameters#unpermitted_parameters!", () => {
  it("raises on_unpermitted: :raise regardless of the class default", () => {
    const params = new Parameters({ name: "John", admin: true });
    expect(() =>
      params.unpermittedParametersBang(new Parameters({ name: "John" }), {
        onUnpermitted: "raise",
      }),
    ).toThrow(new UnpermittedParameters(["admin"]).message);
  });
});
