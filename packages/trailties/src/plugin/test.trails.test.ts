import { afterEach, describe, expect, it, vi } from "vitest";
import { File, rbFLoad } from "@blazetrails/ruby-compat";
import { TestUnitReporter } from "../test-unit/reporter.js";
import { Runner } from "../test-unit/runner.js";

vi.mock("@blazetrails/activesupport/node", () => ({}));

describe("plugin/test", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestUnitReporter.executable = "bin/trails test";
  });

  it("runs the runner as bin/test", async () => {
    const parseOptions = vi.spyOn(Runner, "parseOptions").mockImplementation(() => {});
    const run = vi.spyOn(Runner, "run").mockResolvedValue();

    await rbFLoad(File.join(import.meta.dirname, "test.ts"));

    expect(TestUnitReporter.executable).toBe("bin/test");
    expect(parseOptions).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(parseOptions.mock.calls[0][0]);
  });
});
