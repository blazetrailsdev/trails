import { describe, expect, it } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import "../lib/index.js";
import { YAML } from "../lib/yaml.js";

describe("Mail::YAML", () => {
  describe("#load", () => {
    it("loads YAML", () => {
      expect(YAML.load("{}")).toEqual(new Hash());
    });
  });
});
