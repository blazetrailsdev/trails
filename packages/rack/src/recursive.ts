import { ArgumentError, StringIO, URI, rbFSend, rbObjDup } from "@blazetrails/ruby-compat";
import type { Generic } from "@blazetrails/ruby-compat";
import {
  GET,
  HTTP_HOST,
  HTTP_PORT,
  PATH_INFO,
  QUERY_STRING,
  RACK_INPUT,
  RACK_RECURSIVE_INCLUDE,
  RACK_URL_SCHEME,
  REQUEST_METHOD,
  SCRIPT_NAME,
} from "./constants.js";
import type { RackApp } from "./mock-request.js";

export class ForwardRequest extends Error {
  url: Generic;
  env: Record<string, any>;

  constructor(url: string, env: Record<string, any> = {}) {
    const uri = URI.parse(url);
    super(`forwarding to ${url}`);
    this.url = uri;
    this.env = env;

    this.env[PATH_INFO] = this.url.path;
    if (this.url.query != null) this.env[QUERY_STRING] = this.url.query;
    if (this.url.host != null) this.env[HTTP_HOST] = this.url.host;
    if (this.url.port != null) this.env[HTTP_PORT] = this.url.port;
    if (this.url.scheme != null) this.env[RACK_URL_SCHEME] = this.url.scheme;
  }
}

export class Recursive {
  private app: RackApp;
  private scriptName!: string;

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string | string[]>, any]> {
    return rbObjDup(this)._call(env);
  }

  /** @internal */
  async _call(env: Record<string, any>): Promise<[number, Record<string, string | string[]>, any]> {
    this.scriptName = env[SCRIPT_NAME];
    try {
      return await (rbFSend(this.app, "call", {
        ...env,
        [RACK_RECURSIVE_INCLUDE]: this.include.bind(this),
      }) as ReturnType<typeof this.app>);
    } catch (req) {
      if (req instanceof ForwardRequest) return this.call({ ...env, ...req.env });
      throw req;
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
