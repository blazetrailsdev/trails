import { ArgumentError, StringIO, rbFSend, rbObjDup } from "@blazetrails/ruby-compat";
import {
  GET,
  PATH_INFO,
  QUERY_STRING,
  RACK_INPUT,
  RACK_RECURSIVE_INCLUDE,
  REQUEST_METHOD,
  SCRIPT_NAME,
} from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class ForwardRequest extends Error {
  url: string;
  env?: Record<string, any>;

  constructor(url: string, env?: Record<string, any>) {
    super(`ForwardRequest: ${url}`);
    this.url = url;
    this.env = env;
  }
}

export class Recursive {
  private app: RackApp;
  private scriptName: string = "";

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string | string[]>, any]> {
    return rbObjDup(this)._call(env);
  }

  /** @internal */
  async _call(env: Record<string, any>): Promise<[number, Record<string, string | string[]>, any]> {
    let currentEnv = env;
    while (true) {
      this.scriptName = currentEnv[SCRIPT_NAME];
      try {
        return await (rbFSend(this.app, "call", {
          ...currentEnv,
          [RACK_RECURSIVE_INCLUDE]: this.include.bind(this),
        }) as ReturnType<typeof this.app>);
      } catch (e) {
        if (e instanceof ForwardRequest) {
          const fwd = new URL(e.url, "http://localhost");
          const merged: Record<string, any> = { ...currentEnv, ...(e.env || {}) };
          merged[PATH_INFO] = fwd.pathname;
          merged[QUERY_STRING] = fwd.search ? fwd.search.substring(1) : "";
          currentEnv = merged;
        } else {
          throw e;
        }
      }
    }
  }

  async include(
    env: Record<string, any>,
    path: string,
  ): Promise<[number, Record<string, string | string[]>, any]> {
    if (
      !(
        path.indexOf(this.scriptName) === 0 &&
        (path[this.scriptName.length] === "/" || path[this.scriptName.length] === undefined)
      )
    ) {
      throw new ArgumentError(`can only include below ${this.scriptName}, not ${path}`);
    }

    const newEnv = {
      ...env,
      [PATH_INFO]: path,
      [SCRIPT_NAME]: this.scriptName,
      [REQUEST_METHOD]: GET,
      CONTENT_LENGTH: "0",
      CONTENT_TYPE: "",
      [RACK_INPUT]: new StringIO(""),
    };
    return rbFSend(this.app, "call", newEnv) as ReturnType<typeof this.app>;
  }
}
