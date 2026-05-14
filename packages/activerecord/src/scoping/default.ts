import type { Base } from "../base.js";
import type { Relation } from "../relation.js";
import { ScopeRegistry } from "../scoping.js";

/**
 * Manages evaluating and applying default scopes.
 *
 * Mirrors: ActiveRecord::Scoping::Default::DefaultScope
 */
export class DefaultScope {
  readonly scope: (rel: any) => any;
  readonly allQueries: boolean;

  constructor(scope: (rel: any) => any, allQueries = false) {
    this.scope = scope;
    this.allQueries = allQueries;
  }
}

/**
 * Default scope handling — applies default_scope to all queries
 * and provides unscoped to bypass it.
 *
 * Mirrors: ActiveRecord::Scoping::Default
 */
export class Default {
  /**
   * Build the default scope for a model class, applying all accumulated
   * default_scope declarations in order. Skips scopes that don't match
   * the all_queries flag. Returns undefined when inside an evaluate_default_scope
   * call (recursion guard), matching Rails' nil return from build_default_scope.
   *
   * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#build_default_scope
   * @internal
   */
  static buildDefaultScope(
    modelClass: any,
    buildRelation: () => any,
    allQueries?: boolean | null,
  ): any {
    if (modelClass.abstractClass) return undefined;

    const scopes: DefaultScope[] = modelClass.defaultScopes ?? [];
    if (scopes.length === 0) return undefined;

    return evaluateDefaultScope(modelClass, () => {
      let rel = buildRelation();
      for (const scopeObj of scopes) {
        if (isExecuteScope(allQueries, scopeObj)) {
          const result = scopeObj.scope(rel);
          if (result != null) rel = result;
        }
      }
      return rel;
    });
  }

  /** @internal */
  static unscoped(modelClass: any, buildRelation: () => any): any {
    return buildRelation();
  }
}

/**
 * Define a default scope applied to queries for this model.
 * Multiple calls accumulate; all scopes are merged.
 *
 * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#default_scope
 */
export function defaultScope<T extends typeof Base>(
  this: T,
  fn: (rel: Relation<InstanceType<T>>) => Relation<any>,
  options?: { allQueries?: boolean },
): void;
export function defaultScope<T extends typeof Base>(
  this: T,
  fn: (rel: Relation<InstanceType<T>>) => Relation<any>,
  allQueries?: boolean,
): void;
export function defaultScope<T extends typeof Base>(
  this: T,
  fn: (rel: Relation<InstanceType<T>>) => Relation<any>,
  optionsOrAllQueries?: { allQueries?: boolean } | boolean,
): void {
  const allQueries =
    typeof optionsOrAllQueries === "boolean"
      ? optionsOrAllQueries
      : (optionsOrAllQueries?.allQueries ?? false);

  const scopeObj = new DefaultScope(fn as (rel: any) => any, allQueries);
  const existing: DefaultScope[] = (this as any).defaultScopes ?? [];
  (this as any).defaultScopes = [...existing, scopeObj];
}

/**
 * Return a relation that bypasses the default scope. With a block, runs
 * the block with the unscoped relation installed as the current scope so
 * any queries inside also bypass default scopes — matching Rails'
 * `unscoped { ... }` / `unscoped(&block)` form.
 *
 * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#unscoped —
 * `block_given? ? relation.scoping(&block) : relation`
 */
export function unscoped<T extends typeof Base>(this: T): Relation<InstanceType<T>>;
export function unscoped<T extends typeof Base, R>(
  this: T,
  block: () => R | Promise<R>,
): Promise<R>;
export function unscoped<T extends typeof Base, R>(
  this: T,
  block?: () => R | Promise<R>,
): Relation<InstanceType<T>> | Promise<R> {
  const rel = Default.unscoped(this, () => this._buildUnscopedRelation()) as Relation<
    InstanceType<T>
  >;
  if (block) {
    return rel.scoping(block);
  }
  return rel;
}

/**
 * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#default_scopes?
 */
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

/**
 * Mirrors: Scoping::Default#execute_scope?. Returns true when the default
 * scope should be applied, based on the all_queries flag.
 * @internal
 */
function isExecuteScope(
  allQueries: boolean | null | undefined,
  defaultScopeObj: DefaultScope,
): boolean {
  return allQueries == null || (!!allQueries && defaultScopeObj.allQueries);
}

/** @internal */
function isIgnoreDefaultScope(modelClass: any): boolean {
  return !!ScopeRegistry.ignoreDefaultScope(modelClass, true);
}

/** @internal */
function setIgnoreDefaultScope(modelClass: any, value: boolean | null): void {
  ScopeRegistry.setIgnoreDefaultScope(modelClass, value);
}

/**
 * Mirrors: Scoping::Default#evaluate_default_scope. Temporarily sets
 * ignore_default_scope to true while yielding so nested calls don't re-apply
 * the default scope recursively. Returns undefined when already ignoring
 * (matches Rails' nil return from evaluate_default_scope). Saves and restores
 * the prior ScopeRegistry value so nested calls from different classes compose
 * correctly.
 * @internal
 */
function evaluateDefaultScope(modelClass: any, fn: () => unknown): unknown {
  if (isIgnoreDefaultScope(modelClass)) return undefined;
  const prior = ScopeRegistry.ignoreDefaultScope(modelClass, true);
  try {
    setIgnoreDefaultScope(modelClass, true);
    return fn();
  } finally {
    setIgnoreDefaultScope(modelClass, prior);
  }
}
