import type { RackHeaders } from "./index.js";
import { rbProcCall } from "@blazetrails/ruby-compat";
import type { RackApp } from "./mock-request.js";

export class Config {
  private app: RackApp | { call: RackApp };
  private block: (env: Record<string, any>) => void;

  constructor(app: RackApp | { call: RackApp }, block: (env: Record<string, any>) => void) {
    this.app = app;
    this.block = block;
  }

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    this.block(env);
    return rbProcCall(this.app, env) as ReturnType<RackApp>;
  }
}
