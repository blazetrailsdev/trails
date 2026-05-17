/**
 * ActionDispatch::AssumeSSL
 *
 * When proxying through a load balancer that terminates SSL, the forwarded
 * request will appear as though it's HTTP instead of HTTPS to the application.
 * This makes redirects and cookie security target HTTP instead of HTTPS. This
 * middleware makes the server assume that the proxy already terminated SSL,
 * and that the request really is HTTPS.
 */

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
