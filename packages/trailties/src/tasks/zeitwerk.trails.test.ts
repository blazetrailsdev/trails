import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dependencies } from "@blazetrails/activesupport";
import { Rake } from "@blazetrails/rake";
import {
  Dir,
  File,
  FileUtils,
  STDOUT,
  SystemExit,
  rbFLoad,
  setExitCode,
  stderr,
} from "@blazetrails/ruby-compat";
import { Loader, NameError } from "@blazetrails/zeitwerk";
import { Trails } from "../rails.js";

describe("zeitwerk:check", () => {
  let out: string[];
  let root: string;

  async function check(): Promise<void> {
    await Rake.withApplication(async () => {
      await rbFLoad(File.join(import.meta.dirname, "zeitwerk.ts"));
      const task = Rake.application!.lookup("zeitwerk:check")!;
      task.clearPrerequisites();
      await task.invoke();
    });
  }

  beforeEach(() => {
    out = [];
    root = Dir.mktmpdir("zeitwerk-check");
    vi.spyOn(STDOUT, "puts").mockImplementation((...args: unknown[]) => {
      out.push(args.join("\n"));
      return null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Dependencies.autoloadPaths = [];
    Dependencies.autoloadOncePaths = [];
    Dependencies._eagerLoadPaths = new Set();
    FileUtils.rmRf(root);
  });

  it("reports a clean application", async () => {
    await check();
    expect(out).toEqual(["Hold on, I am eager loading the application.", "All is good!"]);
  });

  it("warns about directories that are not eager loaded", async () => {
    const unchecked = File.join(root, "unchecked");
    FileUtils.mkdirP(unchecked);
    File.write(File.join(unchecked, "x.ts"), "");
    Dependencies.autoloadPaths = [unchecked];

    await check();

    expect(out).toContain(`  ${unchecked}`);
    expect(out[2]).toContain("WARNING: The following directories will only be checked");
    expect(out.at(-1)).toBe("Otherwise, all is good!");
    expect(out).not.toContain("All is good!");
  });

  it("aborts with the Zeitwerk::NameError message relative to the root", async () => {
    vi.spyOn(Trails, "root").mockReturnValue({ toString: () => "/app" } as never);
    vi.spyOn(Loader, "eagerLoadAll").mockRejectedValue(
      new NameError("expected file /app/app/models/x.ts to define constant X"),
    );
    const err = vi.spyOn(stderr, "write").mockImplementation(() => true);

    await expect(check()).rejects.toBeInstanceOf(SystemExit);

    expect(err).toHaveBeenCalledWith("expected file app/models/x.ts to define constant X\n");
    expect(out).toEqual(["Hold on, I am eager loading the application."]);
    setExitCode(0);
  });
});
