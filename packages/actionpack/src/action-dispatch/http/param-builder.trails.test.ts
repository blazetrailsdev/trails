import { describe, expect, it } from "vitest";
import { InvalidParameterError } from "./param-error.js";
import { ParamBuilder } from "./param-builder.js";

describe("ParamBuilder#storeNestedParam", () => {
  it("raises InvalidParameterError for an invalid top-level string encoding", () => {
    const builder = ParamBuilder.default;
    let err: unknown;
    try {
      builder.storeNestedParam(builder.makeParams(), "foo", "\uD800E", 0);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(InvalidParameterError);
    expect((err as Error).message).toBe("Invalid encoding for parameter: �E");
  });
});
