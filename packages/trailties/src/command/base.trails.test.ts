import { afterEach, describe, expect, it, vi } from "vitest";
import { UnusedRoutesCommand } from "../commands/unused-routes.js";

describe("Rails::Command::Base.perform", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("dispatches --help to help with the command name, as base.rb:68-71 does", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await UnusedRoutesCommand.perform("unused_routes", ["--help"]);
    const out = log.mock.calls.map(([line]) => line);
    expect(out.slice(0, 2)).toEqual(["Usage:", "  bin/rails unused_routes"]);
    expect(out).toContain("  -g, [--grep=GREP]  # Grep routes by a specific pattern.");
  });
});
