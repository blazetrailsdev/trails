import { RACK_LOGGER } from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class NullLogger {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    env[RACK_LOGGER] = this;
    return this.app(env);
  }

  info(_msg?: string): void {}
  debug(_msg?: string): void {}
  warn(_msg?: string): void {}
  error(_msg?: string): void {}
  fatal(_msg?: string): void {}
  unknown(_msg?: string): void {}
  close(): void {}
}
