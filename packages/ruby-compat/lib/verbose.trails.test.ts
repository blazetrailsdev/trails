import { afterEach, describe, expect, it } from "vitest";

import { setVerbose, verbose } from "./verbose.js";

describe("$VERBOSE", () => {
  afterEach(() => {
    setVerbose(false);
  });

  it("is false until something sets it", () => {
    expect(verbose()).toBe(false);
  });

  it("stores true for any truthy assignment", () => {
    setVerbose("yes");
    expect(verbose()).toBe(true);
  });

  it("keeps nil as the third state", () => {
    setVerbose(null);
    expect(verbose()).toBeNull();
  });
});
