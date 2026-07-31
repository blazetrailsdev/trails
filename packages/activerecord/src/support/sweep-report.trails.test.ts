import { describe, expect, it, afterEach } from "vitest";
import { getFsAsync, getOsAsync, getPathAsync } from "@blazetrails/activesupport";
import { _resetSweepReport, recordSweptTables, sweepReportDir } from "./sweep-report.js";

async function tempReportDir(): Promise<string> {
  const fs = await getFsAsync();
  const os = await getOsAsync();
  const path = await getPathAsync();
  return await fs.mkdtemp!(`${os.tmpdir()}${path.sep}sweep-report-`);
}

async function readReport(dir: string, lane: string): Promise<{ lane: string; tables: string[] }> {
  const fs = await getFsAsync();
  const [name] = (await fs.readdir!(dir)).filter((f) => f.startsWith(`sweep-${lane}-`));
  return JSON.parse(await fs.readFile!(`${dir}/${name}`, "utf8")) as {
    lane: string;
    tables: string[];
  };
}

async function removeReportDir(dir: string): Promise<void> {
  const fs = await getFsAsync();
  for (const name of await fs.readdir!(dir)) await fs.unlink!(`${dir}/${name}`);
  await fs.rmdir!(dir);
}

describe("sweep report", () => {
  afterEach(() => {
    _resetSweepReport();
  });

  it("is off unless AR_SWEEP_REPORT names a directory", () => {
    expect(sweepReportDir(() => undefined)).toBeUndefined();
    expect(sweepReportDir(() => "")).toBeUndefined();
    expect(sweepReportDir(() => "/tmp/sweep")).toBe("/tmp/sweep");
  });

  it("writes nothing when the report directory is unset", async () => {
    const dir = await tempReportDir();
    try {
      await recordSweptTables("sqlite", ["leaked_table"], () => undefined);
      const fs = await getFsAsync();
      expect(await fs.readdir!(dir)).toEqual([]);
    } finally {
      await removeReportDir(dir);
    }
  });

  it("accumulates the swept names for the lane, sorted and deduplicated", async () => {
    const dir = await tempReportDir();
    try {
      const read = (name: string) => (name === "AR_SWEEP_REPORT" ? dir : undefined);
      await recordSweptTables("sqlite", ["octopi", "ar_internal_metadata"], read);
      await recordSweptTables("sqlite", ["ar_internal_metadata", "bk1"], read);

      const report = await readReport(dir, "sqlite");
      expect(report.lane).toBe("sqlite");
      expect(report.tables).toEqual(["ar_internal_metadata", "bk1", "octopi"]);
    } finally {
      await removeReportDir(dir);
    }
  });

  it("keeps the lanes apart", async () => {
    const dir = await tempReportDir();
    try {
      const read = (name: string) => (name === "AR_SWEEP_REPORT" ? dir : undefined);
      await recordSweptTables("sqlite", ["octopi"], read);
      await recordSweptTables("postgres", ["rockets"], read);

      expect((await readReport(dir, "sqlite")).tables).toEqual(["octopi"]);
      expect((await readReport(dir, "postgres")).tables).toEqual(["rockets"]);
    } finally {
      await removeReportDir(dir);
    }
  });
});
