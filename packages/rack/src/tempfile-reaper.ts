import type { RackHeaders } from "./index.js";
import { rbFSend } from "@blazetrails/ruby-compat";
import { RACK_TEMPFILES } from "./constants.js";
import { BodyProxy } from "./body-proxy.js";
import type { RackApp } from "./mock-request.js";

export class TempfileReaper {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    env[RACK_TEMPFILES] ||= [];

    let response: [number, RackHeaders, any];
    try {
      response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
    } catch (e) {
      env[RACK_TEMPFILES]?.forEach((tempfile: any) => tempfile.closeBang());
      throw e;
    }
    const body = response[2];

    response[2] = new BodyProxy(body, () => {
      env[RACK_TEMPFILES]?.forEach((tempfile: any) => tempfile.closeBang());
    });

    return response;
  }
}
