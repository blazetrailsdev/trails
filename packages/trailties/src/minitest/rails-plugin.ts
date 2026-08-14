/**
 * Port of minitest's Rails plugin from
 * `railties/lib/minitest/rails_plugin.rb`.
 */

import { env, Minitest, type BacktraceFilter } from "@blazetrails/activesupport";
import { Trails } from "../rails.js";

interface BacktraceFilterLike {
  filter(backtrace: string[]): string[];
}

/**
 * Mirrors `Minitest::BacktraceFilterWithFallback` (rails_plugin.rb:8-19) — runs
 * the preferred filter and falls back to the previous one when it silences
 * everything.
 *
 * @noRailsEquivalent Ports a real Rails class, but `railties/lib/minitest/` sits
 * outside the trailties libPath the API comparator scans
 * (`railties/lib/rails`, vendor/sources.ts:128), so it cannot be matched —
 * the same reason `Minitest::BacktraceFilter` carries one in
 * `activesupport/src/testing/assertions.ts`. Tracked by
 * `widen-trailties-libpath-to-cover-lib-minitest`.
 */
export class BacktraceFilterWithFallback {
  private preferred: BacktraceFilterLike;
  private fallback: BacktraceFilterLike;

  constructor(preferred: BacktraceFilterLike, fallback: BacktraceFilterLike) {
    this.preferred = preferred;
    this.fallback = fallback;
  }

  filter(backtrace: string[]): string[] {
    let filtered = this.preferred.filter(backtrace);
    if (filtered.length === 0) filtered = this.fallback.filter(backtrace);
    return filtered;
  }
}

/**
 * Mirrors `Minitest.plugin_rails_init` (rails_plugin.rb:111-136) — replaces
 * `Minitest.backtrace_filter` with one that silences gem lines.
 *
 * @missingRailsCall rails_plugin.rb:122-135 swaps three Minitest reporters
 * (`SummaryReporter`, `ProgressReporter`, `ProfileReporter`). trails has no
 * Minitest reporter surface to swap — vitest owns reporting — so only the
 * backtrace-filter arm (:115-120) is ported.
 *
 * @noRailsEquivalent Ports `Minitest.plugin_rails_init`, which the comparator
 * cannot see for the libPath reason on {@link BacktraceFilterWithFallback}.
 */
export function pluginRailsInit(options: { fullBacktrace?: boolean } = {}): void {
  if (env.RAILS_ENV == null && env.RAILS_MINITEST_PLUGIN == null) return;

  if (options.fullBacktrace !== true) {
    // Rails guards with `::Rails.respond_to?(:backtrace_cleaner)` because the
    // plugin can run without Rails loaded.
    if (Trails.backtraceCleaner != null) {
      Minitest.backtraceFilter = new BacktraceFilterWithFallback(
        Trails.backtraceCleaner,
        Minitest.backtraceFilter,
      ) as unknown as BacktraceFilter;
    }
  }
}
