import { afterEach, describe, expect, it, vi } from "vitest";
import { Rake } from "@blazetrails/rake";
import { File, STDOUT, rbFLoad } from "@blazetrails/ruby-compat";

describe("tasks/misc", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function zones(task: string, ...args: unknown[]): Promise<string[]> {
    const out: string[] = [];
    vi.spyOn(STDOUT, "puts").mockImplementation((...lines: unknown[]) => {
      out.push(lines.join("\n"));
      return null;
    });
    await Rake.withApplication(async (rake) => {
      await rbFLoad(File.join(import.meta.dirname, "misc.ts"));
      await rake.lookup(task)!.invoke(...args);
    });
    return out;
  }

  it("lists the zones at the local standard offset", async () => {
    const out = await zones("time:zones:local");
    expect(out.filter((line) => line.startsWith("\n* UTC "))).toHaveLength(1);
  });

  it("lists a country's zones", async () => {
    const out = await zones("time:zones", "US");
    expect(out).toContain("Pacific Time (US & Canada)");
    expect(out).not.toContain("Tokyo");
  });

  it("reads an argument that is no country code as an offset", async () => {
    const out = await zones("time:zones", "9");
    expect(out).toContain("Tokyo");
    expect(out).not.toContain("Pacific Time (US & Canada)");
  });
});
