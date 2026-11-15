import { constGet, rbProcCall } from "@blazetrails/ruby-compat";
import { LocalCacheRegistry, LocalStore } from "./local-cache.js";

type RackEnv = Record<string, unknown>;
type RackResponse = [number, Record<string, unknown>, unknown];
type RackApp =
  | ((env: RackEnv) => RackResponse | Promise<RackResponse>)
  | { call(env: RackEnv): RackResponse | Promise<RackResponse> };

export class Middleware {
  static toString(): string {
    return "ActiveSupport::Cache::Strategy::LocalCache::Middleware";
  }

  readonly name: string;
  readonly localCacheKey: string;
  /** @internal */
  private app: RackApp | null;

  constructor(name: string, localCacheKey: string) {
    this.name = name;
    this.localCacheKey = localCacheKey;
    this.app = null;
  }

  new(app: RackApp): this {
    this.app = app;
    return this;
  }

  async call(env: RackEnv): Promise<RackResponse> {
    let cleanupOnBodyClose = false;
    try {
      LocalCacheRegistry.setCacheFor(this.localCacheKey, new LocalStore());
      const response = (await rbProcCall(this.app, env)) as RackResponse;
      const BodyProxy = constGet(Object, "::Rack::BodyProxy") as new (
        body: unknown,
        block: () => void,
      ) => unknown;
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
