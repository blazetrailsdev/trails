import {
  BodyProxy,
  InvalidParameterError,
  type RackApp,
  type RackEnv,
  type RackMiddleware,
  type RackResponse,
} from "@blazetrails/rack";
import { rbProcCall } from "@blazetrails/ruby-compat";
import { LocalCacheRegistry, LocalStore } from "./local-cache.js";

export class Middleware {
  static toString(): string {
    return "ActiveSupport::Cache::Strategy::LocalCache::Middleware";
  }

  readonly name: string;
  readonly localCacheKey: string;
  /** @internal */
  private app: RackApp | RackMiddleware | null;

  constructor(name: string, localCacheKey: string) {
    this.name = name;
    this.localCacheKey = localCacheKey;
    this.app = null;
  }

  new(app: RackApp | RackMiddleware): this {
    this.app = app;
    return this;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    let cleanupOnBodyClose = false;
    try {
      LocalCacheRegistry.setCacheFor(this.localCacheKey, new LocalStore());
      const response = (await rbProcCall(this.app, env)) as RackResponse;
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
