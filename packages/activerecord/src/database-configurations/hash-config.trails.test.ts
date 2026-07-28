import { describe, it, expect } from "vitest";
import { HashConfig } from "./hash-config.js";
import { AdapterNotFound } from "../errors.js";
import "../connection-handling.js";

describe("DatabaseConfigurations", () => {
  describe("HashConfigTrailsTest", () => {
    // Ruby truthiness: `adapter: ""` is truthy, so Rails' validate! resolves it
    // and raises AdapterNotFound. A JS `if (this.adapter)` would skip validation
    // and leave establishConnection's guard raising AdapterNotSpecified instead.
    it("validate rejects an empty adapter string", () => {
      const config = new HashConfig("default_env", "primary", { adapter: "" });
      expect(() => config.validateBang()).toThrow(AdapterNotFound);
    });
  });
});
