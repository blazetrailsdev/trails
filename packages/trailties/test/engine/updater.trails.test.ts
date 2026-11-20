import { describe, expect, it } from "vitest";
import { Updater } from "../../lib/engine/updater.js";
import { PluginGenerator } from "../../lib/generators/trails/plugin/plugin-generator.js";

describe("Engine::Updater", () => {
  it("memoises a PluginGenerator across calls", () => {
    const a = Updater.generator();
    expect(a).toBeInstanceOf(PluginGenerator);
    expect(Updater.generator()).toBe(a);
  });
});
