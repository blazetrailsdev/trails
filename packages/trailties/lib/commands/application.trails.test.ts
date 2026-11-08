import { afterEach, describe, expect, it, vi } from "vitest";
import { capture } from "@blazetrails/activesupport";
import { SystemExit, getProcessAdapter } from "@blazetrails/ruby-compat";
import { invoke } from "../command.js";
import { VERSION } from "../gem-version.js";

describe("Trails::Command::ApplicationCommand", () => {
  afterEach(() => vi.restoreAllMocks());

  it("invoke application --version prints the version through handle_version_request!", async () => {
    vi.spyOn(getProcessAdapter(), "exit").mockImplementation((code) => {
      throw new SystemExit(code ?? 0);
    });
    let status: number | null = null;
    const output = await capture(":stdout", async () => {
      try {
        await invoke("application", ["--version"]);
      } catch (e) {
        if (!(e instanceof SystemExit)) throw e;
        status = e.status;
      }
    });
    expect(output).toBe(`Trails ${VERSION.STRING}\n`);
    expect(status).toBe(0);
  }, 30_000);
});
