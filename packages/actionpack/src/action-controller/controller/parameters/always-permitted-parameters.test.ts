import { describe, it, expect, afterEach } from "vitest";
import { Parameters } from "../../metal/strong-parameters.js";

describe("AlwaysPermittedParametersTest", () => {
  const originalAlways = [...Parameters.alwaysPermittedParameters];

  afterEach(() => {
    Parameters.alwaysPermittedParameters = [...originalAlways];
    Parameters.actionOnUnpermittedParameters = false;
  });

  it("returns super on missing constant other than NEVER_UNPERMITTED_PARAMS", () => {
    expect(Parameters.alwaysPermittedParameters).toContain("controller");
    expect(Parameters.alwaysPermittedParameters).toContain("action");
  });

  it("allows both explicitly listed and always-permitted parameters", () => {
    Parameters.actionOnUnpermittedParameters = "raise";
    Parameters.alwaysPermittedParameters = ["controller", "action", "format"];
    const params = new Parameters({ name: "John", format: "json" });
    const permitted = params.permit("name");
    expect(permitted.get("name")).toBe("John");
  });
});
