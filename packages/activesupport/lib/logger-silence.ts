import { Logger as RubyLogger } from "@blazetrails/ruby-compat";
import { include, included } from "@blazetrails/ruby-compat/include";
import { LoggerThreadSafeLevel } from "./logger-thread-safe-level.js";
import type { LogLevel } from "./logger.js";

interface LoggerSilenceHost {
  silencer: boolean;
  logAt<T>(level: number | LogLevel, fn: () => T): T;
}

export const LoggerSilence = {
  [included](base: {
    silencer?: boolean;
    setSilencer?(silencer: boolean): void;
    prototype: object;
  }): void {
    base.silencer = true;
    base.setSilencer = function (this: { silencer: boolean }, silencer: boolean): void {
      this.silencer = silencer;
    };
    Object.defineProperty(base.prototype, "silencer", {
      configurable: true,
      get(this: object) {
        return (this.constructor as unknown as { silencer: boolean }).silencer;
      },
    });
    Object.defineProperty(base.prototype, "setSilencer", {
      configurable: true,
      writable: true,
      value(this: object, silencer: boolean): void {
        (this.constructor as unknown as { setSilencer(silencer: boolean): void }).setSilencer(
          silencer,
        );
      },
    });
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
