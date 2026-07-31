import { describe, expect, it, afterEach } from "vitest";
import { getFsAsync } from "@blazetrails/activesupport";
import { _resetSweepReport, recordSweptTables, sweepReportDir } from "./sweep-report.js";

// Trails-only: `AR_SWEEP_REPORT` is instrumentation for RFC 0064's measurement
// of the global between-test sweep, with no Rails counterpart.
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
    await expect(
      recordSweptTables("sqlite", ["leaked_table"], () => undefined),
    ).resolves.toBeUndefined();
  });

  it("survives a filesystem that cannot write the report", async () => {
    const fs = await getFsAsync();
    expect(typeof fs.exists).toBe("function");
    await expect(recordSweptTables("sqlite", [], () => undefined)).resolves.toBeUndefined();
  });
});
