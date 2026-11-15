import { BodyProxy, InvalidParameterError } from "@blazetrails/rack";
import { rbProcCall } from "@blazetrails/ruby-compat";
import { LocalCacheRegistry, LocalStore } from "./local-cache.js";

type Env = Record<string, unknown>;
type Response = [number, Record<string, unknown>, unknown];
type App = ((env: Env) => Response | Promise<Response>) | { call(env: Env): unknown };

export class Middleware {
  readonly name: string;
  readonly localCacheKey: string;
  /** @internal */
  private app: App | null;

  constructor(name: string, localCacheKey: string) {
    this.name = name;
    this.localCacheKey = localCacheKey;
    this.app = null;
  }

  new(app: App): this {
    this.app = app;
    return this;
  }

  async call(env: Env): Promise<Response> {
    let cleanupOnBodyClose = false;
    try {
      LocalCacheRegistry.setCacheFor(this.localCacheKey, new LocalStore());
      const response = (await rbProcCall(this.app, env)) as Response;
      response[2] = new BodyProxy(response[2], () => {
        LocalCacheRegistry.setCacheFor(this.localCacheKey, null);
      });
      cleanupOnBodyClose = true;
      return response;
    } catch (error) {
      if (error instanceof InvalidParameterError) return [400, {}, []];
      throw error;
    } finally {
      if (!cleanupOnBodyClose) LocalCacheRegistry.setCacheFor(this.localCacheKey, null);
    }
  }
}
