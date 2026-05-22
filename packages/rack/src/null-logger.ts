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

  info(_progname?: any, _block?: () => any): void {}
  debug(_progname?: any, _block?: () => any): void {}
  warn(_progname?: any, _block?: () => any): void {}
  error(_progname?: any, _block?: () => any): void {}
  fatal(_progname?: any, _block?: () => any): void {}
  unknown(_progname?: any, _block?: () => any): void {}

  infoQ(): undefined {
    return undefined;
  }
  debugQ(): undefined {
    return undefined;
  }
  warnQ(): undefined {
    return undefined;
  }
  errorQ(): undefined {
    return undefined;
  }
  fatalQ(): undefined {
    return undefined;
  }

  debugBang(): void {}
  errorBang(): void {}
  fatalBang(): void {}
  infoBang(): void {}
  warnBang(): void {}

  get level(): undefined {
    return undefined;
  }
  set level(_level: any) {}

  get progname(): undefined {
    return undefined;
  }
  set progname(_progname: any) {}

  get datetimeFormat(): undefined {
    return undefined;
  }
  set datetimeFormat(_datetimeFormat: any) {}

  get formatter(): undefined {
    return undefined;
  }
  set formatter(_formatter: any) {}

  get sevThreshold(): undefined {
    return undefined;
  }
  set sevThreshold(_sevThreshold: any) {}

  close(): void {}

  add(_severity: any, _message?: any, _progname?: any, _block?: () => any): void {}
  log(_severity: any, _message?: any, _progname?: any, _block?: () => any): void {}
  append(_msg: any): void {}
  reopen(_logdev?: any): void {}
}
