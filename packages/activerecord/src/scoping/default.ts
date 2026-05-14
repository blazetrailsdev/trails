import { NotImplementedError } from "../errors.js";
import type { Base } from "../base.js";
import type { Relation } from "../relation.js";

/**
 * Default scope handling — applies default_scope to all queries
 * and provides unscoped to bypass it.
 *
 * Mirrors: ActiveRecord::Scoping::Default
 */
export class Default {
  /** @internal */
  static buildDefaultScope(modelClass: any, buildRelation: () => any): any {
    let rel = buildRelation();
    const defaultScopeFn = modelClass._defaultScope;
    if (defaultScopeFn) {
      rel = defaultScopeFn(rel);
    }
    return rel;
  }

  static unscoped(modelClass: any, buildRelation: () => any): any {
    return buildRelation();
  }
}

/**
 * Manages evaluating and applying default scopes.
 *
 * Mirrors: ActiveRecord::Scoping::Default::DefaultScope
 */
export class DefaultScope {
  readonly modelClass: any;
  readonly allQueries: boolean;

  constructor(modelClass: any, allQueries = false) {
    this.modelClass = modelClass;
    this.allQueries = allQueries;
  }

  get scope(): ((rel: any) => any) | null {
    return this.modelClass._defaultScope ?? null;
  }
}

/**
 * Define a default scope applied to all queries for this model.
 *
 * Mirrors: ActiveRecord::Scoping::Default::ClassMethods#default_scope
 */
export function defaultScope<T extends typeof Base>(
  this: T,
  fn: (rel: Relation<InstanceType<T>>) => Relation<any>,
): void {
  this._defaultScope = fn as (rel: any) => any;
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

/** @internal */
function buildDefaultScope(): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/scoping/default.rb cluster=relation
  throw new NotImplementedError(
    "ActiveRecord::Scoping::Default#build_default_scope is not implemented",
  );
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
function isIgnoreDefaultScope(): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/scoping/default.rb cluster=relation
  throw new NotImplementedError(
    "ActiveRecord::Scoping::Default#ignore_default_scope? is not implemented",
  );
}

/** @internal */
function ignoreDefaultScope(): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/scoping/default.rb cluster=relation
  throw new NotImplementedError(
    "ActiveRecord::Scoping::Default#ignore_default_scope= is not implemented",
  );
}

/**
 * Mirrors: Scoping::Default#evaluate_default_scope. Temporarily sets
 * ignore_default_scope to true while yielding so nested calls don't re-apply
 * the default scope recursively.
 * @internal
 */
async function evaluateDefaultScope(modelClass: any, fn: () => unknown): Promise<unknown> {
  if (modelClass._ignoreDefaultScope) return;
  try {
    modelClass._ignoreDefaultScope = true;
    return await fn();
  } finally {
    modelClass._ignoreDefaultScope = false;
  }
}
