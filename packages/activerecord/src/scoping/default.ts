import { ArgumentError } from "@blazetrails/activemodel";
import { any } from "@blazetrails/activesupport";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { Base } from "../base.js";
import { Relation } from "../relation.js";
import { ScopeRegistry, isScopeAttributes as baseIsScopeAttributes } from "../scoping.js";
import { Scoping } from "../namespaces.js";

type DefaultScopeBody<R = any> = ((this: R) => any) | { call(): any };

export class DefaultScope {
  readonly scope: DefaultScopeBody;
  readonly allQueries: boolean;

  constructor(scope: DefaultScopeBody, allQueries = false) {
    this.scope = scope;
    this.allQueries = allQueries;
  }
}

export class Default {
  /** @internal */
  static buildDefaultScope(
    this: any,
    relation: any = this.relation(),
    { allQueries }: { allQueries?: boolean | null } = {},
  ): any {
    if (this.abstractClass) return undefined;

    if (this.defaultScopeOverride == null) {
      this.defaultScopeOverride = hasDefaultScopeOverride(this);
    }

    if (this.defaultScopeOverride) {
      return evaluateDefaultScope.call(this, () => relation.scoping(() => this.defaultScope()));
    } else if (any(this.defaultScopes)) {
      return evaluateDefaultScope.call(this, () =>
        (this.defaultScopes as DefaultScope[]).reduce((combinedScope, scopeObj) => {
          if (isExecuteScope(allQueries, scopeObj)) {
            const scope =
              typeof scopeObj.scope === "function"
                ? scopeObj.scope
                : scopeObj.scope.call.bind(scopeObj.scope);

            return scope.call(combinedScope) || combinedScope;
          } else {
            return combinedScope;
          }
        }, relation),
      );
    }
  }

  static unscoped(this: any, block?: () => any): any {
    return block ? this.relation().scoping(block) : this.relation();
  }
}

/** @internal */
function defaultScopeMethod(modelClass: any): ((this: any) => any) | undefined {
  let klass = modelClass;
  while (typeof klass === "function") {
    if (Object.prototype.hasOwnProperty.call(klass, "defaultScope")) {
      return klass.defaultScope === defaultScope ? undefined : klass.defaultScope;
    }
    klass = Object.getPrototypeOf(klass);
  }
  return undefined;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE default-scope-override-reads-the-default-scope-method-owner
 */
export function hasDefaultScopeOverride(modelClass: any): boolean {
  return defaultScopeMethod(modelClass) !== undefined;
}

export function defaultScope<T extends typeof Base>(
  this: T,
  scope: DefaultScopeBody<Relation<InstanceType<T>>>,
  options?: { allQueries?: boolean },
): void;
export function defaultScope<T extends typeof Base>(
  this: T,
  scope: DefaultScopeBody<Relation<InstanceType<T>>>,
  allQueries?: boolean,
): void;
export function defaultScope<T extends typeof Base>(
  this: T,
  scope: DefaultScopeBody<Relation<InstanceType<T>>>,
  optionsOrAllQueries?: { allQueries?: boolean } | boolean,
): void {
  if (scope instanceof Relation || !rbObjRespondTo(scope, "call")) {
    throw new ArgumentError(
      "Support for calling #default_scope without a block is removed. For " +
        "example instead of `default_scope where(color: 'red')`, please use " +
        "`default_scope { where(color: 'red') }`. (Alternatively you can just " +
        "redefine self.default_scope.)",
    );
  }

  const allQueries =
    typeof optionsOrAllQueries === "boolean"
      ? optionsOrAllQueries
      : (optionsOrAllQueries?.allQueries ?? false);

  const scopeObj = new DefaultScope(scope, allQueries);
  (this as any).defaultScopes = [...(this as any).defaultScopes, scopeObj];
}

export function unscoped<T extends typeof Base>(this: T): Relation<InstanceType<T>>;
export function unscoped<T extends typeof Base, R>(
  this: T,
  block: () => R | Promise<R>,
): Promise<R>;
export function unscoped<T extends typeof Base, R>(
  this: T,
  block?: () => R | Promise<R>,
): Relation<InstanceType<T>> | Promise<R> {
  return Default.unscoped.call(this, block) as Relation<InstanceType<T>> | Promise<R>;
}

export function isScopeAttributes(this: {
  currentScope?(skipInheritedScope?: boolean): unknown;
  defaultScopes: DefaultScope[];
}): boolean {
  return (
    baseIsScopeAttributes.call(this) || any(this.defaultScopes) || hasDefaultScopeOverride(this)
  );
}

export function isDefaultScopes(
  this: { defaultScopes?: DefaultScope[] },
  options?: { allQueries?: boolean },
): boolean {
  const scopes = this.defaultScopes ?? [];
  if (options?.allQueries) {
    return scopes.some((s) => s.allQueries);
  }
  return scopes.length > 0;
}

/** @internal */
function isExecuteScope(
  allQueries: boolean | null | undefined,
  defaultScopeObj: DefaultScope,
): boolean {
  return allQueries == null || (!!allQueries && defaultScopeObj.allQueries);
}

/** @internal */
export function isIgnoreDefaultScope(this: any): boolean {
  return !!ScopeRegistry.ignoreDefaultScope(this.baseClass);
}

/** @internal */
function setIgnoreDefaultScope(this: any, ignore: boolean | null): void {
  ScopeRegistry.setIgnoreDefaultScope(this.baseClass, ignore);
}

/** @internal */
function evaluateDefaultScope(this: any, fn: () => unknown): unknown {
  if (isIgnoreDefaultScope.call(this)) return undefined;

  try {
    setIgnoreDefaultScope.call(this, true);
    return fn();
  } finally {
    setIgnoreDefaultScope.call(this, false);
  }
}

Scoping.Default = Default;
