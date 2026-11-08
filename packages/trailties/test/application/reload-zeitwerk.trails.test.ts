import { Open3, getProcessAdapter } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";

describe("the reloader drives the main autoloader", () => {
  it("reload constants on development", async () => {
    const script = decodeURIComponent(
      new URL("../fixtures/reload-app/serve-edited-controller.mjs", import.meta.url).pathname,
    );
    const [stdout] = await Open3.capture3(getProcessAdapter().execPath!(), script);
    expect(JSON.parse(String(stdout).trim().split("\n").at(-1)!)).toEqual({
      before: 1,
      after: 2,
      tracked: true,
      newClass: true,
      newParent: true,
      oldClassExcluded: true,
    });
  }, 60_000);
});
