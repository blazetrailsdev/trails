import type { RackHeaders } from "./index.js";
import { rbFSend, rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { Method } from "@blazetrails/ruby-compat";
import { REQUEST_METHOD, HEAD as HEAD_METHOD } from "./constants.js";
import type { RackApp } from "./mock-request.js";
import { BodyProxy } from "./body-proxy.js";

export class Head {
  private app: RackApp | Method;

  constructor(app: RackApp | Method) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, RackHeaders, any]> {
    const response = await (rbFSend(this.app, "call", env) as ReturnType<RackApp>);
    const [, , body] = response;

    if (env[REQUEST_METHOD] === HEAD_METHOD) {
      response[2] = new BodyProxy([], () => {
        if (rbObjRespondTo(body, "close")) body.close();
      });
    }

    return response;
  }
}
