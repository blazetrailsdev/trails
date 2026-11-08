import { afterEach, describe, expect, it, vi } from "vitest";
import { Updater } from "./updater.js";

describe("Engine::Updater", () => {
  afterEach(() => {
    Updater.reset();
  });

  it("memoises generator across calls", () => {
    const factory = vi.fn(() => ({ install: () => "ok" }));
    Updater.setGeneratorFactory(factory);
    const a = Updater.generator();
    const b = Updater.generator();
    expect(a).toBe(b);
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("resets the cached generator when the factory changes", () => {
    Updater.setGeneratorFactory(() => ({ a: () => "first" }));
    const first = Updater.generator();
    Updater.setGeneratorFactory(() => ({ a: () => "second" }));
    const second = Updater.generator();
    expect(first).not.toBe(second);
  });

  it("runs the named action on the generator", () => {
    const install = vi.fn(() => 42);
    Updater.setGeneratorFactory(() => ({ install }));
    expect(Updater.run("install")).toBe(42);
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("raises when no factory is installed", () => {
    Updater.reset();
    expect(() => Updater.generator()).toThrow(/no generator factory/);
  });

  it("raises when the action is missing", () => {
    Updater.setGeneratorFactory(() => ({}));
    expect(() => Updater.run("missing")).toThrow(/no generator action/);
  });
});
