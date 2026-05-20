import type { RackEnv } from "@blazetrails/rack";
import { Request } from "../http/request.js";

/** @internal */
const DEFAULT_ENV: RackEnv = {
  HTTP_HOST: "test.host",
  REMOTE_ADDR: "0.0.0.0",
  HTTP_USER_AGENT: "Rails Testing",
};

export class TestRequest extends Request {
  constructor(env: RackEnv = {}) {
    super({
      REQUEST_METHOD: "GET",
      PATH_INFO: "/",
      HTTP_HOST: "test.host",
      SERVER_NAME: "test.host",
      SERVER_PORT: "80",
      ...env,
    });
  }

  /** @internal */
  static defaultEnv(): RackEnv {
    return { ...DEFAULT_ENV };
  }

  set requestUri(uri: string) {
    this.setHeader("REQUEST_URI", uri);
  }

  set action(actionName: string) {
    this.pathParameters = { ...this.pathParameters, action: String(actionName) };
  }

  set remoteAddr(addr: string) {
    this.setHeader("REMOTE_ADDR", addr);
  }
}
