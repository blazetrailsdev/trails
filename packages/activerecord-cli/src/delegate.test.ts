import { describe, it, expect, vi, afterEach } from "vitest";
import { run } from "./cli.js";

// Spy on delegateBin to avoid actually spawning child processes.
vi.mock("./delegate.js", () => ({
  delegateBin: vi.fn((_pkg: string, _bin: string, _args: string[]) => 0),
}));

import { delegateBin } from "./delegate.js";
const mockDelegate = delegateBin as ReturnType<typeof vi.fn>;

describe("delegate subcommands", () => {
  afterEach(() => {
    mockDelegate.mockReset();
    mockDelegate.mockReturnValue(0);
  });

  it("typecheck delegates to trails-tsc and forwards extra args", async () => {
    const code = await run(["typecheck", "--noEmit"], ".");
    expect(code).toBe(0);
    expect(mockDelegate).toHaveBeenCalledWith("@blazetrails/activerecord", "trails-tsc", [
      "--noEmit",
    ]);
  });

  it("schema:dump delegates to trails-schema-dump", async () => {
    const code = await run(["schema:dump"], ".");
    expect(code).toBe(0);
    expect(mockDelegate).toHaveBeenCalledWith(
      "@blazetrails/activerecord",
      "trails-schema-dump",
      [],
    );
  });

  it("models:dump delegates to trails-models-dump", async () => {
    const code = await run(["models:dump", "--json"], ".");
    expect(code).toBe(0);
    expect(mockDelegate).toHaveBeenCalledWith("@blazetrails/activerecord", "trails-models-dump", [
      "--json",
    ]);
  });

  it("propagates non-zero exit code from delegate", async () => {
    mockDelegate.mockReturnValue(2);
    const code = await run(["typecheck"], ".");
    expect(code).toBe(2);
  });
});
