import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import "../support/canonical-model-index.js";
import { describe, it, expect } from "vitest";
import { Base } from "../../lib/index.js";
import { constantize } from "@blazetrails/activesupport";
import { Author } from "../models/author.js";
import "../models/country.js";

describe("registerModel canonical-name shadow guard", () => {
  it("allows re-registering the canonical class under its own name", () => {
    expect(() => constSet(TopLevel, "Author", Author)).not.toThrow();
    expect(() => constSet(TopLevel, "Author", Author)).not.toThrow();
  });

  it("allows a bespoke class under a non-canonical name", () => {
    class RfWidgetXyz extends Base {}
    expect(() => constSet(TopLevel, "RfWidgetXyz", RfWidgetXyz)).not.toThrow();
  });

  it("binds the habtm join model as a private constant", () => {
    expect(constantize("Country::HABTM_Treaties")).toBeDefined();
  });
});
