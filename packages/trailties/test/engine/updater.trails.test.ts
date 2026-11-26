import { describe, expect, it } from "vitest";
import { NoMethodError } from "@blazetrails/ruby-compat/no-method-error";
import { Updater } from "../../lib/engine/updater.js";
import { PluginGenerator } from "../../lib/generators/trails/plugin/plugin-generator.js";

describe("Engine::Updater", () => {
  it("memoises a PluginGenerator across calls", () => {
    const a = Updater.generator();
    expect(a).toBeInstanceOf(PluginGenerator);
    expect(Updater.generator()).toBe(a);
  });
});

describe("Engine::Updater.run", () => {
  it("public_sends the action to the generator", () => {
    const generator = Updater.generator() as unknown as Record<string, unknown>;
    generator.createBinFilesProbe = () => 42;
    expect(Updater.run("createBinFilesProbe")).toBe(42);
  });

  it("raises NoMethodError for an action the generator lacks", () => {
    expect(() => Updater.run("noSuchAction")).toThrow(NoMethodError);
  });
});
