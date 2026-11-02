import { afterEach, describe, expect, it, vi } from "vitest";
import { Rake } from "@blazetrails/rake";
import { File, TopLevel, rbFLoad, stderr, stdout } from "@blazetrails/ruby-compat";
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
    vi.spyOn(stderr, "write").mockReturnValue(true);
    const warn = vi.spyOn(deprecator(), "warn").mockReturnValue(undefined as never);

    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "statistics.ts"));
      await rake.lookup("stats")!.invoke();
    });

    expect(warn.mock.calls.map(([m]) => m).join()).toContain(
      "`bin/rake stats` has been deprecated",
    );
    expect(out).toContain("Code LOC:");
  });
});
