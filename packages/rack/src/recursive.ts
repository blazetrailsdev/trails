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

  constructor(app: RackApp) {
    this.app = app;
  }

  async call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    return this._call(env);
  }

  /** @internal */
  async _call(env: Record<string, any>): Promise<[number, Record<string, string>, any]> {
    let currentEnv = env;
    while (true) {
      const scriptName: string = currentEnv[SCRIPT_NAME] || "";
      const include = (newEnv: Record<string, any>, path: string) =>
        this.include(newEnv, path, scriptName);
      try {
        return await this.app({ ...currentEnv, [RACK_RECURSIVE_INCLUDE]: include });
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

  /** @internal */
  async include(
    env: Record<string, any>,
    path: string,
    scriptName = "",
  ): Promise<[number, Record<string, string>, any]> {
    if (scriptName !== "" && !(path.startsWith(scriptName + "/") || path === scriptName)) {
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
