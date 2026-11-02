import { afterEach, describe, expect, it, vi } from "vitest";
import { Rake } from "@blazetrails/rake";
import { File, STDERR, TopLevel, rbFLoad, stdout } from "@blazetrails/ruby-compat";
import { deprecator } from "../deprecator.js";

describe("tasks/statistics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete TopLevel.STATS_DIRECTORIES;
  });

  it("reports code statistics and warns of the deprecation", async () => {
    let out = "";
    vi.spyOn(stdout, "write").mockImplementation((s: string) => {
      out += s;
      return true;
    });
    const puts = vi.spyOn(STDERR, "puts").mockReturnValue(null);
    const warn = vi.spyOn(deprecator(), "warn").mockReturnValue(undefined);

    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "statistics.ts"));
      await rake.lookup("stats")!.invoke();
    });

    expect(warn.mock.calls.map(([m]) => m).join()).toContain(
      "`bin/rake stats` has been deprecated",
    );
    expect(puts).toHaveBeenCalledWith(null);
    expect(out).toContain("Code LOC:");
  });
});
