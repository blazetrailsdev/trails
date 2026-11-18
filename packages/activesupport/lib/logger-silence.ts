import { Logger as RubyLogger } from "@blazetrails/ruby-compat";
import { include, included } from "@blazetrails/ruby-compat/include";
import { cattrAccessor } from "./module-ext.js";
import { LoggerThreadSafeLevel } from "./logger-thread-safe-level.js";
import type { LogLevel } from "./logger.js";

interface LoggerSilenceHost {
  silencer: boolean;
  logAt<T>(level: number | LogLevel, fn: () => T): T;
}

export const LoggerSilence = {
  [included](base: object): void {
    cattrAccessor.call(base, "silencer", { default: true });
    include(base, LoggerThreadSafeLevel);
  },

  silence<T>(
    this: LoggerSilenceHost,
    severity: number | LogLevel = RubyLogger.ERROR,
    fn?: (logger: LoggerSilenceHost) => T,
  ): T | undefined {
    return this.silencer ? this.logAt(severity, () => fn?.(this)) : fn?.(this);
  },
};
