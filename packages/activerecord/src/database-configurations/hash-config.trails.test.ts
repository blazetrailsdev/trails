import { describe, it, expect } from "vitest";
import { HashConfig } from "./hash-config.js";
import { AdapterNotFound } from "../errors.js";
import "../connection-handling.js";

describe("DatabaseConfigurations", () => {
  describe("HashConfigTrailsTest", () => {
    it("validate rejects an empty adapter string", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "" });
      expect(() => config.validateBang()).toThrow(AdapterNotFound);
    });
  });
});
