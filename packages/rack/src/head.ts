import { rbFSend } from "@blazetrails/ruby-compat";
import { REQUEST_METHOD, HEAD as HEAD_METHOD } from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class Head {
  private app: RackApp;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string | string[]>, any]> {
    const response = await (rbFSend(this.app, "call", env) as ReturnType<typeof this.app>);
    const [, , body] = response;

    if (env[REQUEST_METHOD] === HEAD_METHOD) {
      if (body && typeof body.close === "function") body.close();
      response[2] = [];
    }

    return response;
  }
}
