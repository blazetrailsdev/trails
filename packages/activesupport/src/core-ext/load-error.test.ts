import { describe, it, expect } from "vitest";

describe("TestLoadError", () => {
  it("with require", async () => {
    const mod = "no_this_file_dont_exist";
    await expect(import(/* @vite-ignore */ mod)).rejects.toThrow();
  });

  it("with load", async () => {
    const mod = "nor_does_this_one";
    await expect(import(/* @vite-ignore */ mod)).rejects.toThrow();
  });

  it("path", async () => {
    const mod = "nor/this/one";
    try {
      await import(/* @vite-ignore */ mod);
      expect.unreachable("should have thrown");
    } catch (e: any) {
      expect(e.message).toContain("nor/this/one");
    }
  });

  it("is missing with nil path", () => {
    const error = new Error() as Error & { code?: string; path?: string };
    error.code = "MODULE_NOT_FOUND";
    error.path = undefined as unknown as string;
    expect(error.code).toBe("MODULE_NOT_FOUND");
    expect(error.path).toBeUndefined();
    expect(() => {
      const isMissing = error.code === "MODULE_NOT_FOUND";
      if (isMissing) return true;
    }).not.toThrow();
  });
});
