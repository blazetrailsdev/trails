import { describe, it, expect } from "vitest";

import { Text } from "./text.js";

describe("TextTest (trails-only)", () => {
  it("to_str and render return a binary String unchanged", () => {
    const bytes = new Uint8Array([0x89, 0x00, 0xff, 0xc3, 0x28]);
    expect(new Text(bytes).toString()).toBe(bytes);
    expect(new Text(bytes).render()).toBe(bytes);
  });

  it("to_str is the empty string for nil", () => {
    expect(new Text(null).toString()).toBe("");
  });
});
