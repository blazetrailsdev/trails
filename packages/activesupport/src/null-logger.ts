/**
 * No-op Logger — discards all output while honoring the Logger interface
 * (level filtering, silence blocks, tagged logging). Used as a safe default
 * before an application wires up real logging (e.g. as the fallback in
 * `Application::Bootstrap`'s `:initialize_logger` initializer).
 *
 * `add` / `log` short-circuit to avoid formatter calls and
 * `Temporal.Now.instant()` allocations on the boot hot path; level
 * predicates (`debugEnabled`, `warnEnabled`, …) still reflect `this.level`.
 */
import { Logger } from "./logger.js";

export class NullLogger extends Logger {
  constructor() {
    super(null);
  }

  override add(_severity: number, _message?: string | null, _progname?: string): boolean {
    return true;
  }

  override log(_severity: number, _message?: string | (() => string), _progname?: string): boolean {
    return true;
  }

  override append(_s: string): void {}
  override close(): void {}
}

/** Convenience factory; equivalent to `new NullLogger()`. */
export function nullLogger(): NullLogger {
  return new NullLogger();
}
