import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getProcessAdapter } from "@blazetrails/ruby-compat";

describe("Trails boot enables source maps for precompiled templates", () => {
  it("names the .tse line in a failing template's TemplateError under plain node", () => {
    const script = decodeURIComponent(
      new URL("./__fixtures__/source-maps/render-broken.mjs", import.meta.url).pathname,
    );
    const result = spawnSync(getProcessAdapter().execPath!(), [script], {
      encoding: "utf8",
      env: { PATH: "" },
    });
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout.trim().split("\n").at(-1)!)).toEqual({ lineNumber: "3" });
  }, 60_000);
});
