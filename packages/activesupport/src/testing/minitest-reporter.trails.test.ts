import { describe, expect, it } from "vitest";

import {
  Assertion,
  CompositeReporter,
  IO,
  Minitest,
  ProgressReporter,
  Reportable,
  Skip,
  StatisticsReporter,
  SummaryReporter,
  UnexpectedError,
  UnexpectedWarning,
} from "./assertions.js";

/**
 * trails-only: the minitest gem's own reporter tests
 * (`test/minitest/test_minitest_reporter.rb`) are not enrolled in
 * `parity:test`, which scans vendored Rails, so these cover the ported surface
 * under trails names.
 */
class FakeIO implements IO {
  string = "";
  sync = false;

  print(str: string): void {
    this.string += str;
  }

  puts(str = ""): void {
    this.string += str.endsWith("\n") ? str : `${str}\n`;
  }
}

function result(overrides: Partial<Reportable> = {}): Reportable {
  const failure = overrides.failure ?? null;
  return {
    name: "test_ok",
    assertions: 1,
    time: 0.5,
    failure,
    passed: () => failure === null,
    skipped: () => failure instanceof Skip,
    resultCode: () => (failure === null ? "." : "F"),
    toString: () => "FakeResult#test_ok",
    ...overrides,
  };
}

describe("Minitest reporters", () => {
  it("CompositeReporter dispatches to its reporters", () => {
    const io = new FakeIO();
    const progress = new ProgressReporter(io);
    const reporter = new CompositeReporter(progress);
    const stats = new StatisticsReporter(io);

    reporter.push(stats);
    expect(reporter.reporters).toEqual([progress, stats]);
    expect(reporter.io).toBe(io);

    reporter.start();
    reporter.record(result());
    reporter.report();

    expect(io.string).toBe(".");
    expect(stats.count).toBe(1);
    expect(reporter.passed()).toBe(true);
  });

  it("ProgressReporter prints the class and time when verbose", () => {
    const io = new FakeIO();
    const reporter = new ProgressReporter(io, { verbose: true });

    reporter.prerecord({ name: "FakeTest" }, "test_ok");
    reporter.record(result());

    expect(io.string).toBe("FakeTest#test_ok = 0.50 s = .\n");
  });

  it("StatisticsReporter counts failures, errors, warnings and skips by class", () => {
    const reporter = new StatisticsReporter(new FakeIO());

    reporter.start();
    reporter.record(result());
    reporter.record(result({ failure: new Assertion("boom") }));
    reporter.record(result({ failure: new UnexpectedError(new Error("boom")) }));
    reporter.record(result({ failure: new UnexpectedWarning("boom") }));
    reporter.record(result({ failure: new Skip("later") }));
    reporter.report();

    expect(reporter.count).toBe(5);
    expect(reporter.assertions).toBe(5);
    expect(reporter.results.length).toBe(4);
    expect([reporter.failures, reporter.errors, reporter.warnings, reporter.skips]).toEqual([
      1, 1, 1, 1,
    ]);
    expect(reporter.passed()).toBe(false);
    expect(reporter.totalTime).not.toBeNull();
  });

  it("SummaryReporter reports the header, the failures and the summary", () => {
    const io = new FakeIO();
    const reporter = new SummaryReporter(io, { args: "--seed 42" });

    reporter.start();
    expect(io.string).toBe("Run options: --seed 42\n\n# Running:\n\n");
    expect(io.sync).toBe(true);

    reporter.record(result({ failure: new Assertion("boom") }));
    reporter.report();

    expect(io.string).toContain("1 runs, 1 assertions, 1 failures, 0 errors, 0 skips");
    expect(io.string).toContain("  1) FakeResult#test_ok");
    expect(reporter.statistics()).toMatch(/^Finished in \d+\.\d{6}s, /);
  });

  it("SummaryReporter#toString renders the aggregated results alone", () => {
    const reporter = new SummaryReporter(new FakeIO());

    reporter.record(result({ failure: new Assertion("boom") }));
    expect(String(reporter)).toBe("\n  1) FakeResult#test_ok\n\n");
  });

  it("Minitest.reporter is an unset CompositeReporter seat", () => {
    expect(Minitest.reporter).toBeNull();

    const reporter = new CompositeReporter();
    Minitest.reporter = reporter;
    try {
      expect(Minitest.reporter.reporters).toEqual([]);
    } finally {
      Minitest.reporter = null;
    }
  });

  it("Minitest.clockTime returns monotonic seconds", () => {
    const before = Minitest.clockTime();
    expect(typeof before).toBe("number");
    expect(Minitest.clockTime()).toBeGreaterThanOrEqual(before);
  });
});
