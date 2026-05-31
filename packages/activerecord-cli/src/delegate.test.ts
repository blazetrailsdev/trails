import { describe, it, expect, vi, afterEach } from "vitest";
import { run } from "./cli.js";

// Spy on delegateBin to avoid actually spawning child processes.
vi.mock("./delegate.js", () => ({
  delegateBin: vi.fn((_pkg: string, _bin: string, _args: string[]) => 0),
}));

// Spy on the in-process bin run() functions so tests don't need a real DB.
vi.mock("./bin/trails-schema-dump.js", () => ({
  run: vi.fn((_argv: string[]) => Promise.resolve(0)),
}));
vi.mock("./bin/trails-models-dump.js", () => ({
  run: vi.fn((_argv: string[]) => Promise.resolve(0)),
}));

import { delegateBin } from "./delegate.js";
import { run as schemaDumpRun } from "./bin/trails-schema-dump.js";
import { run as modelsDumpRun } from "./bin/trails-models-dump.js";
const mockDelegate = delegateBin as ReturnType<typeof vi.fn>;
const mockSchemaDump = schemaDumpRun as ReturnType<typeof vi.fn>;
const mockModelsDump = modelsDumpRun as ReturnType<typeof vi.fn>;

describe("delegate subcommands", () => {
  afterEach(() => {
    mockDelegate.mockReset();
    mockDelegate.mockReturnValue(0);
    mockSchemaDump.mockReset();
    mockSchemaDump.mockResolvedValue(0);
    mockModelsDump.mockReset();
    mockModelsDump.mockResolvedValue(0);
  });

  it("typecheck delegates to trails-tsc and forwards extra args", async () => {
    const code = await run(["typecheck", "--noEmit"], ".");
    expect(code).toBe(0);
    expect(mockDelegate).toHaveBeenCalledWith("@blazetrails/activerecord", "trails-tsc", [
      "--noEmit",
    ]);
  });

  it("schema:dump calls trails-schema-dump run() in-process", async () => {
    const code = await run(["schema:dump", "--out", "schema.json"], ".");
    expect(code).toBe(0);
    expect(mockSchemaDump).toHaveBeenCalledWith(["--out", "schema.json"]);
  });

  it("models:dump calls trails-models-dump run() in-process", async () => {
    const code = await run(["models:dump", "--no-header"], ".");
    expect(code).toBe(0);
    expect(mockModelsDump).toHaveBeenCalledWith(["--no-header"]);
  });

  it("propagates non-zero exit code from delegate", async () => {
    mockDelegate.mockReturnValue(2);
    const code = await run(["typecheck"], ".");
    expect(code).toBe(2);
  });

  it("propagates non-zero exit code from schema:dump", async () => {
    mockSchemaDump.mockResolvedValue(1);
    const code = await run(["schema:dump"], ".");
    expect(code).toBe(1);
  });
});
