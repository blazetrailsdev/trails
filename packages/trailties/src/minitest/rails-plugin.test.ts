import { describe, expect, it } from "vitest";

import { BacktraceFilter, Minitest, env, setEnv } from "@blazetrails/activesupport";
import { pluginRailsInit } from "./rails-plugin.js";

/**
 * `backtrace_gem_line` (rails_plugin_test.rb:96-98) builds a frame inside a
 * gem's `lib`. trails' gems are packages under `node_modules`, which is what
 * `Rails::BacktraceCleaner`'s `APP_DIRS_PATTERN` silences.
 */
function backtraceGemLine(gemName: string): string {
  return `node_modules/${gemName}/lib/${gemName}.js:1:1`;
}

/** Mirrors `with_plugin` (rails_plugin_test.rb:83-94). */
function withPlugin(
  options: { fullBacktrace?: boolean },
  initialBacktraceFilter: BacktraceFilter,
  block: () => void,
): void {
  const originalBacktraceFilter = Minitest.backtraceFilter;
  const originalRailsEnv = env.RAILS_ENV;
  Minitest.backtraceFilter = initialBacktraceFilter;
  setEnv("RAILS_ENV", "test");
  try {
    pluginRailsInit(options);
    block();
  } finally {
    Minitest.backtraceFilter = originalBacktraceFilter;
    setEnv("RAILS_ENV", originalRailsEnv);
  }
}

describe("Minitest::RailsPluginTest", () => {
  it("replaces backtrace filter with one that silences gem lines", () => {
    const backtrace = ["lib/my_code.rb", backtraceGemLine("rails")];

    withPlugin({}, new BacktraceFilter(), () => {
      expect(Minitest.backtraceFilter.filter(backtrace)).toEqual(backtrace.slice(0, 1));
    });
  });

  it("replacement backtrace filter never returns an empty backtrace", () => {
    const backtrace = [backtraceGemLine("rails")];

    withPlugin({}, new BacktraceFilter(), () => {
      expect(Minitest.backtraceFilter.filter(backtrace)).toEqual(backtrace);
    });
  });

  it("does not replace backtrace filter when using --backtrace option", () => {
    const backtraceFilter = new BacktraceFilter();

    withPlugin({ fullBacktrace: true }, backtraceFilter, () => {
      expect(Minitest.backtraceFilter).toBe(backtraceFilter);
    });
  });
});
