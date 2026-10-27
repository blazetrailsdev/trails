import { describe, expect, it, vi } from "vitest";

const { rbConstWarnIfDeprecated } = vi.hoisted(() => ({ rbConstWarnIfDeprecated: vi.fn() }));
vi.mock("@blazetrails/ruby-compat", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@blazetrails/ruby-compat")>();
  rbConstWarnIfDeprecated.mockImplementation(actual.rbConstWarnIfDeprecated);
  return { ...actual, rbConstWarnIfDeprecated };
});

const { Tool } = await import("./tool.js");

describe("MiniMagick::Tool deprecated constants", () => {
  it("warns through rb_const_warn_if_deprecated on each read", () => {
    rbConstWarnIfDeprecated.mockClear();
    const Convert = (Tool as unknown as Record<string, typeof Tool>).Convert;
    expect(String(Convert)).toBe("MiniMagick::Tool::Convert");
    expect(Object.getPrototypeOf(Convert)).toBe(Tool);
    expect(rbConstWarnIfDeprecated.mock.calls).toEqual([[Tool, "Convert"]]);
  });
});
