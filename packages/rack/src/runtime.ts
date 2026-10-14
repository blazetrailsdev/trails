import { rbFSend } from "@blazetrails/ruby-compat";
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

  async call(env: Record<string, any>): Promise<[number, Record<string, string | string[]>, any]> {
    const startTime = clockTime();
    const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
    const [, headers] = response;
    const requestTime = clockTime() - startTime;

    if (!(this.headerName in headers)) {
      headers[this.headerName] = requestTime.toFixed(6);
    }

    return response;
  }
}
