import { describe, expect, it } from "vitest";

import { BacktraceFilter, Minitest } from "@blazetrails/activesupport";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { pluginRailsInit } from "./rails-plugin.js";

function backtraceGemLine(gemName: string): string {
  return `node_modules/${gemName}/lib/${gemName}.js:1:1`;
}

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
