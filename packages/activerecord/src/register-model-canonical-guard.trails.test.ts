import "./support/canonical-model-index.js";
import { describe, it, expect } from "vitest";
import { Base, registerModel } from "./index.js";
import { constantize } from "@blazetrails/activesupport";
import { Author } from "./test-helpers/models/author.js";
import "./test-helpers/models/country.js";

describe("registerModel canonical-name shadow guard", () => {
  it("allows re-registering the canonical class under its own name", () => {
    expect(() => registerModel("Author", Author)).not.toThrow();
    expect(() => registerModel(Author)).not.toThrow();
  });

  it("allows a bespoke class under a non-canonical name", () => {
    class RfWidgetXyz extends Base {}
    expect(() => registerModel("RfWidgetXyz", RfWidgetXyz)).not.toThrow();
  });

  it("binds the habtm join model as a private constant", () => {
    expect(constantize("Country::HABTM_Treaties")).toBeDefined();
  });
});
