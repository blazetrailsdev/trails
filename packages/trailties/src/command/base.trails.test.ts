import { describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { UnusedRoutesCommand } from "../commands/unused-routes.js";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "./base.js";

describe("Rails::Command::Base.perform", () => {
  it("dispatches --help to help with the command name, as base.rb:68-71 does", async () => {
    const out = (
      await capture(":stdout", () => UnusedRoutesCommand.perform("unused-routes", ["--help"], {}))
    ).split("\n");
    expect(out.slice(0, 2)).toEqual(["Usage:", "  bin/rails unused-routes"]);
    expect(out).toContain("  -g, [--grep=GREP]              # Grep routes by a specific pattern.");
  });
});

describe("Rails::Command::Base helpers", () => {
  it("keeps executable and invokeCommand out of allCommands", () => {
    const commands = (Base as unknown as ThorClass).allCommands();
    expect(Object.keys(commands)).not.toContain("executable");
    expect(Object.keys(commands)).not.toContain("invokeCommand");
  });
});
