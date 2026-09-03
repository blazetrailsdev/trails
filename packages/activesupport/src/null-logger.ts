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

export function nullLogger(): NullLogger {
  return new NullLogger();
}
