import { PATH_INFO, QUERY_STRING, SCRIPT_NAME, RACK_RECURSIVE_INCLUDE } from "./constants.js";
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
  private scriptName = "";

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    return this._call(env);
  }

  /** @internal */
  async _call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    this.scriptName = env[SCRIPT_NAME] || "";
    const include = (newEnv: Record<string, any>, path: string) => this.include(newEnv, path);
    try {
      return await this.app({ ...env, [RACK_RECURSIVE_INCLUDE]: include });
    } catch (e) {
      if (e instanceof ForwardRequest) {
        return this.call({ ...env, ...(e.env || {}) });
      }
      throw e;
    }
  }

  /** @internal */
  async include(
    env: Record<string, any>,
    path: string,
  ): Promise<[number, Record<string, string>, any]> {
    const scriptName = this.scriptName;
    if (!(path.startsWith(scriptName + "/") || path === scriptName || scriptName === "")) {
      throw new Error(`can only include below ${scriptName}, not ${path}`);
    }
    const url = new URL(path, "http://localhost");
    const newEnv = {
      ...env,
      [PATH_INFO]: url.pathname,
      [QUERY_STRING]: url.search ? url.search.substring(1) : "",
      [SCRIPT_NAME]: scriptName,
    };
    return this.app(newEnv);
  }
}
