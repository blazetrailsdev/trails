import { afterEach, describe, expect, it, vi } from "vitest";
import { rbModConstants, rbModName, rbWarningSAset, stderr } from "@blazetrails/ruby-compat";
import { Tool } from "./tool.js";

describe("MiniMagick::Tool deprecated constants", () => {
  afterEach(() => {
    rbWarningSAset(":deprecated", false);
    vi.restoreAllMocks();
  });

  it("warns on each read with the :deprecated category, as rb_const_warn_if_deprecated does", () => {
    rbWarningSAset(":deprecated", true);
    const write = vi.spyOn(stderr, "write").mockImplementation(() => true);
    const Convert = (Tool as unknown as Record<string, typeof Tool>).Convert;
    expect(rbModName(Convert)).toBe("MiniMagick::Tool::Convert");
    expect(Object.getPrototypeOf(Convert)).toBe(Tool);
    expect(write.mock.calls).toEqual([["constant MiniMagick::Tool::Convert is deprecated\n"]]);
  });

  it("still lists the deprecated constants", () => {
    expect(rbModConstants(Tool)).toEqual(expect.arrayContaining(["Convert", "Identify"]));
  });
});
