import { describe, it, expect, afterEach } from "vitest";
import { Parameters, UnpermittedParameters } from "../../metal/strong-parameters.js";
import { assertNothingRaised } from "@blazetrails/activesupport";

describe("RaiseOnUnpermittedParamsTest", () => {
  afterEach(() => {
    Parameters.actionOnUnpermittedParameters = false;
  });

  it("raises on unexpected params", () => {
    Parameters.actionOnUnpermittedParameters = "raise";
    const params = new Parameters({ name: "John", admin: true });
    expect(() => params.permit("name")).toThrow(UnpermittedParameters);
  });

  it("raises on unexpected nested params", () => {
    Parameters.actionOnUnpermittedParameters = "raise";
    const inner = new Parameters({ title: "Hi", admin: true });
    const params = new Parameters({ post: inner });
    expect(() => params.permit({ post: ["title"] })).toThrow(UnpermittedParameters);
  });

  it("expect never raises on unexpected params", async () => {
    Parameters.actionOnUnpermittedParameters = "raise";
    const params = new Parameters({
      id: 1,
      book: { pages: 65, title: "Green Cats and where to find them." },
    });

    await assertNothingRaised(() => {
      params.expect({ book: ["pages"] });
      params.expect({ book: ["pages", "title"] });
      params.expect("id");
    });
  });

  it("expect! never raises on unexpected params", () => {
    Parameters.actionOnUnpermittedParameters = "raise";
    const inner = new Parameters({ title: "Hi", admin: true });
    const params = new Parameters({ post: inner });
    expect(() => params.expectBang({ post: ["title"] })).not.toThrow(UnpermittedParameters);
  });
});
