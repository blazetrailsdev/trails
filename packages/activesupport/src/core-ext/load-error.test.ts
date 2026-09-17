import { describe, it, expect } from "vitest";
import { LoadError } from "./load-error.js";

describe("TestLoadError", () => {
  it("with require", async () => {
    const mod = "no_this_file_dont_exist";
    await expect(import(mod)).rejects.toThrow();
  });

  it("with load", async () => {
    const mod = "nor_does_this_one";
    await expect(import(mod)).rejects.toThrow();
  });

  it("path", async () => {
    const mod = "nor/this/one.rb";
    try {
      await import(mod);
    } catch (e) {
      // eslint-disable-next-line vitest/no-conditional-expect
      expect((e as Error).message.match(/'([^']*)'/)![1]).toEqual("nor/this/one.rb");
    }
  });

  it("is missing with nil path", () => {
    const error = new LoadError();
    expect(() => error.isMissing("anything")).not.toThrow();
  });
});
