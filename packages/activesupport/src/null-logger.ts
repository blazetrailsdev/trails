/**
 * No-op Logger — discards all output while honoring the Logger interface
 * (level filtering, silence blocks, tagged logging). Used as a safe default
 * before applications wire up real logging (e.g. `Trails.logger` pre-init).
 */
import { Logger } from "./logger.js";

export class NullLogger extends Logger {
  constructor() {
    super(null);
  }

  override append(_s: string): void {}
  override close(): void {}
}

/** Convenience factory matching the `nullStore()` style used elsewhere. */
export function nullLogger(): NullLogger {
  return new NullLogger();
}
