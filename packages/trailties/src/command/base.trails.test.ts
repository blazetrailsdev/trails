import { describe, expect, it } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { UnusedRoutesCommand } from "../commands/unused-routes.js";

describe("Rails::Command::Base.perform", () => {
  it("dispatches --help to help with the command name, as base.rb:68-71 does", async () => {
    const out = (
      await capture(":stdout", () => UnusedRoutesCommand.perform("unused_routes", ["--help"]))
    ).split("\n");
    expect(out.slice(0, 2)).toEqual(["Usage:", "  bin/rails unused_routes"]);
    expect(out).toContain("  -g, [--grep=GREP]              # Grep routes by a specific pattern.");
  });
});
