import { afterEach, describe, expect, it, vi } from "vitest";
import { warn } from "./kernel-warn.js";
import { stderr } from "./process-adapter.js";

describe("Kernel#warn", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes nothing for a disabled category and raises for an unknown one", () => {
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    warn("old", { category: ":deprecated" });
    expect(write).not.toHaveBeenCalled();
    warn("new", { category: ":experimental" });
    expect(write).toHaveBeenCalledWith("new\n");
    expect(() => warn("x", { category: ":nope" })).toThrow("unknown category: :nope");
  });
});
