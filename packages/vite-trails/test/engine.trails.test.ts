import { describe, expect, it } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { constDefined } from "@blazetrails/ruby-compat";

describe("ViteTrails::Engine", () => {
  it("vite_trails.bootstrap sees Trails::Server once the server command loads", async () => {
    await import("../../trailties/lib/commands/server.js");
    expect(constDefined(TopLevel, "Trails::Server")).toBe(true);
  }, 60_000);
});
