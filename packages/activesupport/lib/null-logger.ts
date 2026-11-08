import { Logger } from "./logger.js";

export class NullLogger extends Logger {
  constructor() {
    super(null);
  }

  override add(
    _severity: number | null,
    _message?: unknown,
    _progname?: string | null,
    _block?: () => unknown,
  ): boolean {
    return true;
  }

  override append(_s: string): void {}
  override close(): void {}
}

export function nullLogger(): NullLogger {
  return new NullLogger();
}
