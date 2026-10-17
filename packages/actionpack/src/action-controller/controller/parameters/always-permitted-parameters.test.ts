import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { assertPredicate } from "@blazetrails/activesupport";
import { Parameters } from "../../metal/strong-parameters.js";

describe("AlwaysPermittedParametersTest", () => {
  beforeEach(() => {
    Parameters.actionOnUnpermittedParameters = "raise";
    Parameters.alwaysPermittedParameters = ["controller", "action", "format"];
  });

  afterEach(() => {
    Parameters.actionOnUnpermittedParameters = false;
    Parameters.alwaysPermittedParameters = ["controller", "action"];
  });

  it("returns super on missing constant other than NEVER_UNPERMITTED_PARAMS", () => {
    expect(Parameters.alwaysPermittedParameters).toContain("controller");
    expect(Parameters.alwaysPermittedParameters).toContain("action");
  });

  it("allows both explicitly listed and always-permitted parameters", () => {
    const params = new Parameters({ book: { pages: 65 }, format: "json" });
    const permitted = params.permit({ book: ["pages"] });
    assertPredicate(permitted, (p) => p.isPermitted());
  });
});
