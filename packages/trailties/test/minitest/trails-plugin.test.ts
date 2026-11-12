import { describe, expect, it } from "vitest";

import { BacktraceFilter, Minitest } from "@blazetrails/activesupport/testing/assertions";
import { env, setEnv } from "@blazetrails/ruby-compat";
import { pluginTrailsInit } from "../../lib/minitest/trails-plugin.js";

function backtraceGemLine(gemName: string): string {
  return `node_modules/${gemName}/lib/${gemName}.js:1:1`;
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

  it("does not replace backtrace filter when using --backtrace option", () => {
    const backtraceFilter = new BacktraceFilter();

    withPlugin({ fullBacktrace: true }, backtraceFilter, () => {
      expect(Minitest.backtraceFilter).toBe(backtraceFilter);
    });

    withPlugin({ fullBacktrace: true }, backtraceFilter, () => {
      expect(Minitest.backtraceFilter).toBe(backtraceFilter);
    });
  });
});
