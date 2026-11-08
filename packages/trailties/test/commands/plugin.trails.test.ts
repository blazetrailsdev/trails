import { describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { Dir, File } from "@blazetrails/ruby-compat";
import { invoke } from "../../lib/command.js";

describe("Trails::Command::PluginCommand", () => {
  it("invoke plugin without new prints the plugin generator's help", async () => {
    const output = await capture(":stdout", () => invoke("plugin", ["--no-rc"]));
    expect(output).toContain("trails plugin new APPPATH [options]");
  }, 30_000);

  it("invoke plugin reads extra arguments from the --rc file", async () => {
    const railsrc = File.join(Dir.mktmpdir("plugin-command"), ".trailsrc");
    await File.writeAsync(railsrc, "--skip-git\n--skip-test\n");
    const output = await capture(":stdout", () => invoke("plugin", ["--rc", railsrc]));
    expect(output).toContain(`Using --skip-git --skip-test from ${railsrc}`);
  }, 30_000);

  it("invoke plugin --no-rc skips the --rc file", async () => {
    const railsrc = File.join(Dir.mktmpdir("plugin-command"), ".trailsrc");
    await File.writeAsync(railsrc, "--skip-git\n");
    const output = await capture(":stdout", () => invoke("plugin", ["--rc", railsrc, "--no-rc"]));
    expect(output).not.toContain("Using --skip-git");
  }, 30_000);
});
