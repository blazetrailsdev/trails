import { RouteSet, type DrawCallback } from "@blazetrails/actionpack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { _Trails } from "../trails-slot.js";

function reloadRoutesUnlessLoaded(): Promise<boolean> | undefined {
  return _Trails!.application?.reloadRoutesUnlessLoaded();
}

type AnyFn = (...args: unknown[]) => unknown;
type ProxyHelpers = Record<
  "urlFor" | "fullUrlFor" | "routeFor" | "polymorphicUrl" | "polymorphicPath",
  AnyFn
>;

export class LazyRouteSet extends RouteSet {
  override draw(callback: DrawCallback): void {
    void reloadRoutesUnlessLoaded();
    super.draw(callback);
  }

  override generateExtras(
    options: Record<string, unknown>,
    recall: Record<string, unknown> = {},
  ): [string, string[]] {
    void reloadRoutesUnlessLoaded();
    return super.generateExtras(options, recall);
  }

  override recognizePath(
    path: string,
    environment: { method?: string | null; extras?: Record<string, unknown> } = {},
  ): Record<string, unknown> {
    void reloadRoutesUnlessLoaded();
    return super.recognizePath(path, environment);
  }

  override recognizePathWithRequest(
    req: { requestMethod?: string; method?: string },
    path: string,
    extras: Record<string, unknown> = {},
    options: { raiseOnMissing?: boolean } = {},
  ): Record<string, unknown> | undefined {
    void reloadRoutesUnlessLoaded();
    return super.recognizePathWithRequest(req, path, extras, options);
  }

  override async call(req: RackEnv): Promise<RackResponse> {
    await reloadRoutesUnlessLoaded();
    return super.call(req);
  }

  override generateUrlHelpers(supportsPath: boolean): ReturnType<RouteSet["generateUrlHelpers"]> {
    const mod = super.generateUrlHelpers(supportsPath);
    const helpers = mod as unknown as ProxyHelpers;
    const wrap = (name: keyof ProxyHelpers): void => {
      const original = helpers[name].bind(helpers);
      helpers[name] = (...args: unknown[]): unknown => {
        void reloadRoutesUnlessLoaded();
        return original(...args);
      };
    };
    wrap("urlFor");
    wrap("fullUrlFor");
    wrap("routeFor");
    wrap("polymorphicUrl");
    wrap("polymorphicPath");
    return mod;
  }
}
