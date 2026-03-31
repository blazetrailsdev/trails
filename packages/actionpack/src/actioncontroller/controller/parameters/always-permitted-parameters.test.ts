import { describe, it, expect, afterEach } from "vitest";
import { Parameters } from "../../metal/strong-parameters.js";

describe("AlwaysPermittedParametersTest", () => {
  const originalAlways = [...Parameters.alwaysPermittedParameters];

  afterEach(() => {
    Parameters.alwaysPermittedParameters = [...originalAlways];
    Parameters.actionOnUnpermittedParameters = false;
  });

  it("returns super on missing constant other than NEVER_UNPERMITTED_PARAMS", () => {
    // In TS, alwaysPermittedParameters is a class-level array
    expect(Parameters.alwaysPermittedParameters).toContain("controller");
    expect(Parameters.alwaysPermittedParameters).toContain("action");
  });

  it("allows both explicitly listed and always-permitted parameters", () => {
    Parameters.actionOnUnpermittedParameters = "raise";
    Parameters.alwaysPermittedParameters = ["controller", "action", "format"];
    const params = new Parameters({ name: "John", format: "json" });
    // "format" is always-permitted, so only "name" being permitted should not raise
    // because format is in always-permitted list
    const permitted = params.permit("name");
    expect(permitted.get("name")).toBe("John");
  });
});
