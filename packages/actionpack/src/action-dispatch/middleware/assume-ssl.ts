import type { RackApp, RackEnv, RackResponse } from "@blazetrails/rack";

export class AssumeSSL {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  call(env: RackEnv): Promise<RackResponse> {
    env["HTTPS"] = "on";
    env["HTTP_X_FORWARDED_PORT"] = "443";
    env["HTTP_X_FORWARDED_PROTO"] = "https";
    env["rack.url_scheme"] = "https";

    return this.app(env);
  }
}
