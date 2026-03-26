/**
 * Default scope handling — applies default_scope to all queries
 * and provides unscoped to bypass it.
 *
 * Mirrors: ActiveRecord::Scoping::Default
 */
export class Default {
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

  constructor(modelClass: any) {
    this.modelClass = modelClass;
  }

  get scope(): ((rel: any) => any) | null {
    return this.modelClass._defaultScope ?? null;
  }
}
