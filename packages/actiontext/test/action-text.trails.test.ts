import { describe, expect, it } from "vitest";
import { ActionText, VERSION, deprecator, version } from "../lib/index.js";

describe("ActionText", () => {
  it("answers its version and a memoized deprecator", () => {
    expect(VERSION.STRING).toBe("8.0.2");
    expect(version().toString()).toBe("8.0.2");
    expect(ActionText.version().toString()).toBe("8.0.2");
    expect(ActionText.gemVersion().toString()).toBe("8.0.2");
    expect(ActionText.deprecator()).toBe(deprecator());
  });
});
