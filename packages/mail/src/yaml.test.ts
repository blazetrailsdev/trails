import { describe, expect, it } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import "./index.js";
import { YAML } from "./yaml.js";

describe("Mail::YAML", () => {
  describe("#load", () => {
    it("loads YAML", () => {
      expect(YAML.load("{}")).toEqual(new Hash());
    });
  });
});
