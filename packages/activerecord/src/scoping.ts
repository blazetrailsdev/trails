/**
 * Scoping module — manages current scope and scope registry.
 * Base delegates scoping operations to these classes.
 *
 * Mirrors: ActiveRecord::Scoping
 */
export class Scoping {
  static scopeFor(modelClass: any): any | null {
    return ScopeRegistry.currentScope(modelClass);
  }
}

/**
 * Per-model registry tracking the current scope (set via scoping {}).
 * Uses a WeakMap so model classes can be garbage collected.
 *
 * Mirrors: ActiveRecord::Scoping::ScopeRegistry
 */
export class ScopeRegistry {
  private static _currentScopes: WeakMap<object, any> = new WeakMap();

  static currentScope(modelClass: object): any | null {
    return this._currentScopes.get(modelClass) ?? null;
  }

  static setCurrentScope(modelClass: object, scope: any): void {
    if (scope === null) {
      this._currentScopes.delete(modelClass);
    } else {
      this._currentScopes.set(modelClass, scope);
    }
  }
}
