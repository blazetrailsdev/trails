import { ArgumentError } from "@blazetrails/activemodel";
import { any } from "@blazetrails/activesupport";
import type { Base } from "../base.js";
import type { Relation } from "../relation.js";
import { ScopeRegistry, isScopeAttributes as baseIsScopeAttributes } from "../scoping.js";

export class DefaultScope {
  readonly scope: (rel: any) => any;
  readonly allQueries: boolean;

  constructor(scope: (rel: any) => any, allQueries = false) {
    this.scope = scope;
    this.allQueries = allQueries;
  }
}

export class Default {
  /** @internal */
  static buildDefaultScope(
    this: any,
    relation: any,
    { allQueries }: { allQueries?: boolean | null } = {},
  ): any {
    if (this.abstractClass) return undefined;

    if (this.defaultScopeOverride == null) {
      this.defaultScopeOverride = hasDefaultScopeOverride(this);
    }

    if (this.defaultScopeOverride) {
      return evaluateDefaultScope.call(this, () => {
        const prev = ScopeRegistry.currentScope(this);
        this.setCurrentScope(relation);
        try {
          return this.defaultScope();
        } finally {
          this.setCurrentScope(prev);
        }
      });
    }

    const scopes: DefaultScope[] = this.defaultScopes ?? [];
    if (any(scopes)) {
      return evaluateDefaultScope.call(this, () => {
        let combinedScope = relation;
        for (const scopeObj of scopes) {
          if (isExecuteScope(allQueries, scopeObj)) {
            const result = scopeObj.scope(combinedScope);
            if (result != null) combinedScope = result;
          }
        }
        return combinedScope;
      });
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
 * @noRailsEquivalent PERMANENT
 */
export function hasDefaultScopeOverride(modelClass: any): boolean {
  return defaultScopeMethod(modelClass) !== undefined;
}

export function defaultScope<T extends typeof Base>(
  this: T,
  scope: (rel: Relation<InstanceType<T>>) => Relation<any>,
  options?: { allQueries?: boolean },
): void;
export function defaultScope<T extends typeof Base>(
  this: T,
  scope: (rel: Relation<InstanceType<T>>) => Relation<any>,
  allQueries?: boolean,
): void;
export function defaultScope<T extends typeof Base>(
  this: T,
  scope: (rel: Relation<InstanceType<T>>) => Relation<any>,
  optionsOrAllQueries?: { allQueries?: boolean } | boolean,
): void {
  if (typeof scope !== "function") {
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

  const scopeObj = new DefaultScope(scope as (rel: any) => any, allQueries);
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

/** @missingRailsCall any? — PERMANENT */
export function isScopeAttributes(this: {
  currentScope?(skipInheritedScope?: boolean): unknown;
  defaultScopes?: DefaultScope[];
}): boolean {
  return (
    baseIsScopeAttributes.call(this) ||
    (this.defaultScopes?.length ?? 0) > 0 ||
    hasDefaultScopeOverride(this)
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
