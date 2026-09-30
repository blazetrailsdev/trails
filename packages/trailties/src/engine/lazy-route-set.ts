import { RouteSet, type DrawCallback, type Request } from "@blazetrails/actionpack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { TopLevel } from "@blazetrails/activesupport";

type AnyFn = (...args: unknown[]) => unknown;
type ProxyHelpers = Record<
  "urlFor" | "fullUrlFor" | "routeFor" | "polymorphicUrl" | "polymorphicPath",
  AnyFn
>;
type MethodMissingModule = {
  respondToMissing(this: object, name: string, includeAll?: boolean): boolean;
};

export class LazyRouteSet extends RouteSet {
  override draw(callback: DrawCallback): void {
    void TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    super.draw(callback);
  }

  override generateExtras(
    options: Record<string, unknown>,
    recall: Record<string, unknown> = {},
  ): [string, string[]] {
    void TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    return super.generateExtras(options, recall);
  }

  override recognizePath(
    path: string,
    environment: { method?: string | null; extras?: Record<string, unknown> } = {},
  ): Record<string, unknown> {
    void TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    return super.recognizePath(path, environment);
  }

  override recognizePathWithRequest(
    req: Request,
    path: string,
    extras: Record<string, unknown>,
    options: { raiseOnMissing?: boolean } = {},
  ): Record<string, unknown> | undefined {
    void TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    return super.recognizePathWithRequest(req, path, extras, options);
  }

  override async call(req: RackEnv): Promise<RackResponse> {
    await TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    return super.call(req);
  }

  override generateUrlHelpers(supportsPath: boolean): ReturnType<RouteSet["generateUrlHelpers"]> {
    const mod = super.generateUrlHelpers(supportsPath);
    const helpers = mod as unknown as ProxyHelpers;
    const wrap = (name: keyof ProxyHelpers): void => {
      const original = helpers[name].bind(helpers);
      helpers[name] = (...args: unknown[]): unknown => {
        void TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
        return original(...args);
      };
    };
    wrap("urlFor");
    wrap("fullUrlFor");
    wrap("routeFor");
    wrap("polymorphicUrl");
    wrap("polymorphicPath");
    Object.setPrototypeOf(
      mod,
      new Proxy(
        Object.create(
          Object.getPrototypeOf(mod) as object,
          Object.getOwnPropertyDescriptors(this.methodMissingModule()),
        ) as object,
        {
          get(target, name, receiver: MethodMissingModule) {
            if (typeof name === "symbol" || Reflect.has(target, name)) {
              return Reflect.get(target, name, receiver);
            }
            receiver.respondToMissing(name);
            return undefined;
          },
        },
      ),
    );
    return mod;
  }

  /** @internal */
  private _methodMissingModule?: MethodMissingModule;

  /** @internal */
  private methodMissingModule(): MethodMissingModule {
    return (this._methodMissingModule ??= {
      respondToMissing(this: object, _name: string, _includeAll: boolean = false): boolean {
        void TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
        return false;
      },
    });
  }
}
