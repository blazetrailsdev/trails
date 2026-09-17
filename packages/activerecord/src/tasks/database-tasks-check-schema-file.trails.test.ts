import { describe, it, expect, afterEach, vi } from "vitest";
import { setTrailsRoot } from "@blazetrails/activesupport";
import { getProcessAdapter } from "@blazetrails/ruby-compat";
import { DatabaseTasks } from "./database-tasks.js";

describe("DatabaseTasksCheckSchemaFileTest", () => {
  afterEach(() => {
    setTrailsRoot(null);
    vi.restoreAllMocks();
  });

  it("check schema file sets the exit code and writes to stderr", () => {
    const adapter = getProcessAdapter();
    const exitCodes: number[] = [];
    const stderrWrites: string[] = [];
    vi.spyOn(adapter, "setExitCode").mockImplementation((code) => void exitCodes.push(code));
    vi.spyOn(adapter.stderr, "write").mockImplementation((chunk) => {
      stderrWrites.push(chunk);
      return true;
    });

    expect(() => DatabaseTasks.checkSchemaFile("nonexistent-awesome-file.sql")).toThrow(
      /nonexistent-awesome-file\.sql/,
    );
    expect(() => DatabaseTasks.checkSchemaFile("")).toThrow(/doesn't exist yet/);
    expect(stderrWrites.join("")).toMatch(/Run `bin\/rails db:migrate`/);
    expect(stderrWrites.join("")).not.toMatch(/config\/application\.rb/);
    expect(exitCodes).toEqual([1, 1]);
  });

  it("check schema file names the trails root in the message", () => {
    const adapter = getProcessAdapter();
    vi.spyOn(adapter, "setExitCode").mockImplementation(() => {});
    vi.spyOn(adapter.stderr, "write").mockImplementation(() => true);

    setTrailsRoot("/apps/blog");
    expect(() => DatabaseTasks.checkSchemaFile("nonexistent-awesome-file.sql")).toThrow(
      /alter \/apps\/blog\/config\/application\.rb to limit the frameworks that will be loaded\./,
    );
  });
});
