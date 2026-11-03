import { Minitest } from "@blazetrails/activesupport";
import { env } from "@blazetrails/ruby-compat";
import { Trails } from "../trails.js";

/** @noRailsEquivalent PERMANENT */
export class BacktraceFilterWithFallback {
  private preferred: { filter(backtrace: string[]): string[] };
  private fallback: { filter(backtrace: string[]): string[] };

  constructor(
    preferred: { filter(backtrace: string[]): string[] },
    fallback: { filter(backtrace: string[]): string[] },
  ) {
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
 * @missingRailsCall reject! — PERMANENT
 * @missingRailsCall << — PERMANENT
 * @noRailsEquivalent PERMANENT
 */
export function pluginTrailsInit(options: { fullBacktrace?: boolean }): void {
  if (env.TRAILS_ENV == null && env.TRAILS_MINITEST_PLUGIN == null) return;

  if (options.fullBacktrace !== true) {
    if (Trails.backtraceCleaner != null) {
      Minitest.backtraceFilter = new BacktraceFilterWithFallback(
        Trails.backtraceCleaner,
        Minitest.backtraceFilter,
      );
    }
  }
}
