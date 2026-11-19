import { RouteSet, type DrawCallback, type Request } from "@blazetrails/actionpack";
import type { RackEnv, RackResponse } from "@blazetrails/rack";
import { TopLevel } from "@blazetrails/activesupport";
import {
  KERNEL_METHODS,
  NoMethodError,
  PROTOCOL_PROBES,
  prepend,
  rbCallSuper,
  rbFSend,
  rbInspect,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";

type MethodMissingModule = {
  methodMissing(this: object, name: string, ...args: unknown[]): unknown;
  respondToMissing(this: object, name: string, includeAll?: boolean): boolean;
};

class NamedRouteCollection extends RouteSet.NamedRouteCollection {
  override isRouteDefined(name: string): boolean {
    TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    return super.isRouteDefined(name);
  }
}

export class LazyRouteSet extends RouteSet {
  static NamedRouteCollection = NamedRouteCollection;

  static ProxyUrlHelpers = {
    urlFor(this: object, options: unknown): unknown {
      TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
      return rbCallSuper(this, LazyRouteSet.ProxyUrlHelpers.urlFor, options);
    },

    fullUrlFor(this: object, options: unknown): unknown {
      TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
      return rbCallSuper(this, LazyRouteSet.ProxyUrlHelpers.fullUrlFor, options);
    },

    routeFor(this: object, name: string, ...args: unknown[]): unknown {
      TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
      return rbCallSuper(this, LazyRouteSet.ProxyUrlHelpers.routeFor, name, ...args);
    },

    optimizeRoutesGeneration(this: object): unknown {
      TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
      return rbCallSuper(this, LazyRouteSet.ProxyUrlHelpers.optimizeRoutesGeneration);
    },

    polymorphicUrl(this: object, recordOrHashOrArray: unknown, options: unknown = {}): unknown {
      TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
      return rbCallSuper(
        this,
        LazyRouteSet.ProxyUrlHelpers.polymorphicUrl,
        recordOrHashOrArray,
        options,
      );
    },

    polymorphicPath(this: object, recordOrHashOrArray: unknown, options: unknown = {}): unknown {
      TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
      return rbCallSuper(
        this,
        LazyRouteSet.ProxyUrlHelpers.polymorphicPath,
        recordOrHashOrArray,
        options,
      );
    },
  };

  constructor(config?: ConstructorParameters<typeof RouteSet>[0]) {
    super(config);
    this.namedRoutes = new NamedRouteCollection();
    prepend(this.namedRoutes.urlHelpersModule, this.methodMissingModule());
    prepend(this.namedRoutes.pathHelpersModule, this.methodMissingModule());
  }

  override generateExtras(
    options: Record<string, unknown>,
    recall: Record<string, unknown> = {},
  ): [string, string[]] {
    TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    return super.generateExtras(options, recall);
  }

  /**
   * @inventedArm setPrototypeOf — PERMANENT
   * @inventedArm if — PERMANENT
   */
  override generateUrlHelpers(supportsPath: boolean): ReturnType<RouteSet["generateUrlHelpers"]> {
    const mod = super.generateUrlHelpers(supportsPath);
    prepend({ prototype: mod }, LazyRouteSet.ProxyUrlHelpers);
    const parent = Object.getPrototypeOf(mod) as object;
    Object.setPrototypeOf(
      mod,
      new Proxy(Object.create(parent) as object, {
        get(target, name, receiver: MethodMissingModule) {
          if (
            typeof name === "symbol" ||
            Reflect.has(target, name) ||
            PROTOCOL_PROBES.has(name) ||
            KERNEL_METHODS.has(name)
          ) {
            return Reflect.get(target, name, receiver);
          }
          if (!receiver.respondToMissing(name)) return undefined;
          if (name in receiver) return (receiver as Record<string, unknown>)[name];
          return (...args: unknown[]) => receiver.methodMissing(name, ...args);
        },
      }),
    );
    return mod;
  }

  override async call(req: RackEnv): Promise<RackResponse> {
    TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    return super.call(req);
  }

  override draw(callback: DrawCallback): void {
    TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    super.draw(callback);
  }

  override recognizePath(
    path: string,
    environment: { method?: string | null; extras?: Record<string, unknown> } = {},
  ): Record<string, unknown> {
    TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    return super.recognizePath(path, environment);
  }

  override recognizePathWithRequest(
    req: Request,
    path: string,
    extras: Record<string, unknown>,
    options: { raiseOnMissing?: boolean } = {},
  ): Record<string, unknown> | undefined {
    TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    return super.recognizePathWithRequest(req, path, extras, options);
  }

  override routes(): ReturnType<RouteSet["routes"]> {
    TopLevel.Trails!.application?.reloadRoutesUnlessLoaded();
    return super.routes();
  }

  /** @internal */
  private _methodMissingModule?: MethodMissingModule;

  /** @internal */
  private methodMissingModule(): MethodMissingModule {
    return (this._methodMissingModule ??= {
      methodMissing(this: object, name: string, ...args: unknown[]): unknown {
        if (TopLevel.Trails!.application?.reloadRoutesUnlessLoaded()) {
          return rbFSend(this, name, ...args);
        } else {
          throw new NoMethodError(`undefined method '${name}' for ${rbInspect(this)}`, name);
        }
      },

      respondToMissing(this: object, name: string, _includeAll: boolean = false): boolean {
        if (TopLevel.Trails!.application?.reloadRoutesUnlessLoaded()) {
          return rbObjRespondTo(this, name);
        } else {
          return false;
        }
      },
    });
  }
}
