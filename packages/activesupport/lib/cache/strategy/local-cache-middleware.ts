import { constGet, rbFRequire, rbProcCall } from "@blazetrails/ruby-compat";
import { ActiveSupport } from "../../namespaces.js";
import type { RackApp, RackBody, RackEnv, RackMiddleware, RackResponse } from "@blazetrails/rack";
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
    await rbFRequire(ActiveSupport.loadPath, "rack/body_proxy");
    await rbFRequire(ActiveSupport.loadPath, "rack/utils");
    let cleanupOnBodyClose = false;
    try {
      LocalCacheRegistry.setCacheFor(this.localCacheKey, new LocalStore());
      const response = (await rbProcCall(this.app, env)) as RackResponse;
      const BodyProxy = constGet(Object, "::Rack::BodyProxy") as new (
        body: unknown,
        block: () => void,
      ) => RackBody;
      response[2] = new BodyProxy(response[2], () => {
        LocalCacheRegistry.setCacheFor(this.localCacheKey, null);
      });
      cleanupOnBodyClose = true;
      return response;
    } catch (error) {
      if (error instanceof (constGet(Object, "Rack::Utils::InvalidParameterError") as typeof Error))
        return [400, {}, []];
      throw error;
    } finally {
      if (!cleanupOnBodyClose) LocalCacheRegistry.setCacheFor(this.localCacheKey, null);
    }
  }
}
