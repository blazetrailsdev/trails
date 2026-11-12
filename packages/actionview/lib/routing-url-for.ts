import {
  SafeBuffer,
  TopLevel,
  extractOptionsBang,
  isPlainObject,
} from "@blazetrails/activesupport";
import {
  classModule,
  hasKey,
  include,
  included,
  rbModAppendFeatures,
  rbSeatSuper,
  hashAref,
  hashAset,
  isSymbol,
  rbCallSuper,
  rtest,
  symbolToS,
} from "@blazetrails/ruby-compat";

import type { UrlHelperHost } from "./helpers/url-helper.js";

export interface RoutingUrlForHost {
  controller: unknown;
}

export type UrlForOptions = string | null | undefined | object | ReadonlyArray<unknown>;

type Host = RoutingUrlFor &
  RoutingUrlForHost &
  Pick<UrlHelperHost, "_backUrl"> & {
    polymorphicPath(record: unknown, options: Record<string, unknown>): string;
    polymorphicUrl(record: unknown, options: Record<string, unknown>): string;
  };

const _includers = new Set<WeakRef<{ prototype: object }>>();

type Parameters = InstanceType<NonNullable<typeof TopLevel.ActionController>["Parameters"]>;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the class below.
export interface RoutingUrlFor {
  urlFor(options?: unknown): string;
  urlOptions(): Record<string, unknown>;
  /** @internal */
  _routesContext(): unknown;
  /** @internal */
  optimizeRoutesGeneration(): boolean;
  /** @internal */
  _generatePathsByDefault(): boolean;
  /** @internal */
  ensureOnlyPathOption(options: Record<string, unknown> | Parameters): void;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- a class module (`routing_url_for.rb`); the interface carries its instance methods.
export class RoutingUrlFor {
  /** @noRailsEquivalent PERMANENT */
  static readonly [classModule] = true;

  /** @noRailsEquivalent PERMANENT */
  static [included](base: unknown): void {
    if (typeof base !== "function") return;
    for (const ref of _includers) if (ref.deref() === base) return;
    _includers.add(new WeakRef(base));
  }

  static include(this: typeof RoutingUrlFor, ...modules: object[]): void {
    const ownMethods = Object.entries(Object.getOwnPropertyDescriptors(this.prototype));
    for (const mod of modules) {
      include(this, mod);
      for (const ref of _includers) {
        const klass = ref.deref();
        if (klass === undefined) {
          _includers.delete(ref);
          continue;
        }
        const proto = klass.prototype;
        const copied = ownMethods.filter(
          ([name, desc]) =>
            name !== "constructor" &&
            typeof desc.value === "function" &&
            Object.getOwnPropertyDescriptor(proto, name)?.value === desc.value,
        );
        rbModAppendFeatures(klass, mod);
        const seats: PropertyDescriptorMap = {};
        for (const [name, desc] of copied) {
          rbSeatSuper(proto, name, desc.value, seats);
          Object.defineProperty(proto, name, { ...desc, enumerable: false });
        }
        Object.defineProperties(proto, seats);
      }
    }
  }
}

export function urlFor(this: Host, options: UrlForOptions = null): string {
  if ((typeof options === "string" && !isSymbol(options)) || options instanceof SafeBuffer) {
    return options as unknown as string;
  } else if (options == null) {
    return rbCallSuper(this, urlFor, {
      onlyPath: this._generatePathsByDefault(),
    }) as string;
  } else if (isPlainObject(options)) {
    options = { ...(options as Record<string, unknown>) };
    this.ensureOnlyPathOption(options as Record<string, unknown>);

    return rbCallSuper(this, urlFor, options) as string;
  } else if (options instanceof TopLevel.ActionController!.Parameters) {
    this.ensureOnlyPathOption(options);

    return rbCallSuper(this, urlFor, options) as string;
  } else if (options === ":back") {
    return this._backUrl();
  } else if (Array.isArray(options)) {
    const components = [...options];
    options = extractOptionsBang(components) as Record<string, unknown>;
    this.ensureOnlyPathOption(options as Record<string, unknown>);

    if (
      (options as Record<string, unknown>)["onlyPath"] != null &&
      (options as Record<string, unknown>)["onlyPath"] !== false
    ) {
      return this.polymorphicPath(components, options as Record<string, unknown>);
    } else {
      return this.polymorphicUrl(components, options as Record<string, unknown>);
    }
  } else {
    const method = this._generatePathsByDefault() ? "path" : "url";
    const builder =
      TopLevel.ActionDispatch!.Routing.PolymorphicRoutes.HelperMethodBuilder[method]();

    if (isSymbol(options)) {
      return builder.handleStringCall(this, symbolToS(options));
    } else if (typeof options === "function") {
      return builder.handleClassCall(this, options);
    } else {
      return builder.handleModelCall(this, options);
    }
  }
}

/** @internal */
export function urlOptions(this: Host): Record<string, unknown> {
  const controller = this.controller as { urlOptions?: () => Record<string, unknown> } | null;
  if (typeof controller?.urlOptions !== "function")
    return rbCallSuper(this, urlOptions) as Record<string, unknown>;
  return controller.urlOptions();
}

/** @internal */
export function _routesContext(this: Host): unknown {
  return this.controller;
}

/** @internal */
export function optimizeRoutesGeneration(this: Host): boolean {
  const controller = this.controller as { optimizeRoutesGeneration?: () => boolean } | null;
  return typeof controller?.optimizeRoutesGeneration === "function"
    ? controller.optimizeRoutesGeneration()
    : (rbCallSuper(this, optimizeRoutesGeneration) as boolean);
}

/** @internal */
export function _generatePathsByDefault(this: Host): boolean {
  return true;
}

/** @internal */
export function ensureOnlyPathOption(
  this: Host,
  options: Record<string, unknown> | Parameters,
): void {
  if (!hasKey(options, "onlyPath")) {
    if (!rtest(hashAref(options, "host")))
      hashAset(options, "onlyPath", this._generatePathsByDefault());
  }
}

Object.assign(RoutingUrlFor.prototype, {
  urlFor,
  urlOptions,
  _routesContext,
  optimizeRoutesGeneration,
  _generatePathsByDefault,
  ensureOnlyPathOption,
});
