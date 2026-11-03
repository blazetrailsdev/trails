import { rbProcCall } from "@blazetrails/ruby-compat";
import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";
import { Trails } from "../trails.js";

export class SilenceRequest {
  private app: RackApp;
  private path: string;

  constructor(app: RackApp, { path }: { path: string }) {
    this.app = app;
    this.path = path;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    if (env["PATH_INFO"] === this.path) {
      return Trails.logger!.silence(undefined, () =>
        rbProcCall(this.app, env),
      ) as Promise<RackResponse>;
    } else {
      return rbProcCall(this.app, env) as Promise<RackResponse>;
    }
  }
}
