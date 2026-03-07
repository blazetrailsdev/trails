import { PATH_INFO, QUERY_STRING, RACK_RECURSIVE_INCLUDE } from "./constants.js";
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
    env[RACK_RECURSIVE_INCLUDE] = (newEnv: Record<string, any>, path: string) => {
      return this.includeRequest(newEnv, path);
    };

    while (true) {
      try {
        return await this.app(env);
      } catch (e) {
        if (e instanceof ForwardRequest) {
          const url = new URL(e.url, "http://localhost");
          env = e.env || { ...env };
          env[PATH_INFO] = url.pathname;
          env[QUERY_STRING] = url.search ? url.search.substring(1) : "";
        } else {
          throw e;
        }
      }
    }
  }

  private async includeRequest(env: Record<string, any>, path: string): Promise<[number, Record<string, string>, any]> {
    const url = new URL(path, "http://localhost");
    const newEnv = { ...env, [PATH_INFO]: url.pathname, [QUERY_STRING]: url.search ? url.search.substring(1) : "" };
    return this.app(newEnv);
  }
}
