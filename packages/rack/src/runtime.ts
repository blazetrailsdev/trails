import { clockTime } from "./utils.js";
import type { RackApp } from "./mock-request.js";

export class Runtime {
  private app: RackApp;
  private headerName: string;

  constructor(app: RackApp, name?: string) {
    this.app = app;
    this.headerName = "x-runtime";
    if (name) this.headerName += `-${String(name).toLowerCase()}`;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    const startTime = clockTime();
    const response = await this.app(env);
    const [, headers] = response;
    const requestTime = clockTime() - startTime;

    if (!(this.headerName in headers)) {
      headers[this.headerName] = requestTime.toFixed(6);
    }

    return response;
  }
}
