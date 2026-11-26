import { describe, expect, it } from "vitest";

import { BacktraceFilter, Minitest } from "@blazetrails/activesupport/testing/assertions";
import { env, setEnv } from "@blazetrails/ruby-compat/process-adapter";
import { pluginTrailsInit } from "../../lib/minitest/trails-plugin.js";

function backtraceGemLine(gemName: string): string {
  return "node_modules/vitest/dist/vitest.js:1:1".replaceAll("vitest", gemName);
}

function withPlugin(
  options: { fullBacktrace?: boolean },
  initialBacktraceFilter: BacktraceFilter,
  block: () => void,
): void {
  const originalBacktraceFilter = Minitest.backtraceFilter;
  const originalTrailsEnv = env.TRAILS_ENV;
  Minitest.backtraceFilter = initialBacktraceFilter;
  setEnv("TRAILS_ENV", "test");
  try {
    pluginTrailsInit(options);
    block();
  } finally {
    Minitest.backtraceFilter = originalBacktraceFilter;
    setEnv("TRAILS_ENV", originalTrailsEnv);
  }
}

describe("Minitest::TrailsPluginTest", () => {
  it("replaces backtrace filter with one that silences gem lines", () => {
    const backtrace = ["lib/my_code.rb", backtraceGemLine("trails")];

    withPlugin({}, new BacktraceFilter(), () => {
      expect(Minitest.backtraceFilter.filter(backtrace)).toEqual(backtrace.slice(0, 1));
    });
  });

  it("replacement backtrace filter never returns an empty backtrace", () => {
    const backtrace = [backtraceGemLine("trails")];

    withPlugin({}, new BacktraceFilter(), () => {
      expect(Minitest.backtraceFilter.filter(backtrace)).toEqual(backtrace);
    });
  });

  it("replacement backtrace filter silences Minitest lines when all lines are gem lines", () => {
    const backtrace = [backtraceGemLine("trails"), backtraceGemLine("vitest")];

    withPlugin({}, new BacktraceFilter(), () => {
      expect(Minitest.backtraceFilter.filter(backtrace)).toEqual(backtrace.slice(0, 1));
    });
  });

  it("does not replace backtrace filter when using --backtrace option", () => {
    const backtraceFilter = new BacktraceFilter();

    withPlugin({ fullBacktrace: true }, backtraceFilter, () => {
      expect(Minitest.backtraceFilter).toBe(backtraceFilter);
    });
  });
  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "`TestUnitReporter` has no `Minitest::StatisticsReporter` superclass (`test_unit/reporter.rb:7`)" — `trails test` reports through Vitest, so there is no `Minitest.reporter` for `plugin_rails_init` to rewrite.
  it.skip("replaces Minitest::SummaryReporter reporter", () => {
    withPlugin({}, new BacktraceFilter(), () => {
      const reporters = (Minitest as unknown as { reporter: { reporters: object[] } }).reporter
        .reporters;
      expect(
        reporters.filter((reporter) => reporter.constructor.name === "SummaryReporter"),
      ).toEqual([]);
      expect(
        reporters.filter((reporter) => reporter.constructor.name === "SuppressedSummaryReporter"),
      ).not.toEqual([]);
    });
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "`TestUnitReporter` has no `Minitest::StatisticsReporter` superclass (`test_unit/reporter.rb:7`)" — `trails test` reports through Vitest, so there is no `Minitest.reporter` for `plugin_rails_init` to rewrite.
  it.skip("replaces Minitest::ProgressReporter reporter", () => {
    withPlugin({}, new BacktraceFilter(), () => {
      const reporters = (Minitest as unknown as { reporter: { reporters: object[] } }).reporter
        .reporters;
      expect(
        reporters.filter((reporter) => reporter.constructor.name === "ProgressReporter"),
      ).toEqual([]);
      expect(
        reporters.filter((reporter) => reporter.constructor.name === "TestUnitReporter"),
      ).not.toEqual([]);
    });
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "`TestUnitReporter` has no `Minitest::StatisticsReporter` superclass (`test_unit/reporter.rb:7`)" — `trails test` reports through Vitest, so there is no `Minitest.reporter` for `plugin_rails_init` to rewrite.
  it.skip("keeps non-default reporters", () => {
    const customReporter = {};

    withPlugin({}, new BacktraceFilter(), () => {
      expect(
        (Minitest as unknown as { reporter: { reporters: object[] } }).reporter.reporters,
      ).toContain(customReporter);
    });
  });

  // PERMANENT-SKIP: packages/trailties/CLAUDE.md, "`TestUnitReporter` has no `Minitest::StatisticsReporter` superclass (`test_unit/reporter.rb:7`)" — `trails test` reports through Vitest, so there is no `Minitest.reporter` for `plugin_rails_init` to rewrite.
  it.skip("does not add reporters when not replacing reporters", () => {
    withPlugin({}, new BacktraceFilter(), () => {
      expect(
        (Minitest as unknown as { reporter: { reporters: object[] } }).reporter.reporters,
      ).toEqual([]);
    });
  });
});
