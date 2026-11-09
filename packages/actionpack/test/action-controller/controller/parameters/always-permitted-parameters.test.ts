import { describe, it, afterEach, beforeEach } from "vitest";
import { assertEqual, assertPredicate } from "@blazetrails/activesupport/testing/assertions";
import { stub } from "@blazetrails/activesupport/testing/method-call-assertions";
import { rbConstGet } from "@blazetrails/ruby-compat";
import { Parameters } from "../../../../lib/action-controller/metal/strong-parameters.js";

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
    const superclass = Object.getPrototypeOf(Parameters) as { constMissing?: unknown };
    stub(superclass, "constMissing", "super", [], () => {
      assertEqual("super", rbConstGet(Parameters, "NON_EXISTING_CONSTANT"));
    });
  });

  it("allows both explicitly listed and always-permitted parameters", () => {
    const params = new Parameters({ book: { pages: 65 }, format: "json" });
    const permitted = params.permit({ book: ["pages"] });
    assertPredicate(permitted, (p) => p.isPermitted());
  });
});
