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
  private static _ignoreDefaultScope: WeakMap<object, any> = new WeakMap();
  private static _globalCurrentScope: WeakMap<object, any> = new WeakMap();

  private static _instance: ScopeRegistry | null = null;

  static instance(): ScopeRegistry {
    if (!this._instance) this._instance = new ScopeRegistry();
    return this._instance;
  }

  currentScope(modelClass: object, skipInherited = false): any | null {
    return ScopeRegistry.currentScope(modelClass, skipInherited);
  }

  setCurrentScope(modelClass: object, scope: any): void {
    ScopeRegistry.setCurrentScope(modelClass, scope);
  }

  ignoreDefaultScope(modelClass: object, skipInherited = false): any | null {
    return ScopeRegistry.ignoreDefaultScope(modelClass, skipInherited);
  }

  setIgnoreDefaultScope(modelClass: object, value: any): void {
    ScopeRegistry.setIgnoreDefaultScope(modelClass, value);
  }

  globalCurrentScope(modelClass: object, skipInherited = false): any | null {
    return ScopeRegistry.globalCurrentScope(modelClass, skipInherited);
  }

  setGlobalCurrentScope(modelClass: object, scope: any): void {
    ScopeRegistry.setGlobalCurrentScope(modelClass, scope);
  }

  static currentScope(modelClass: object, skipInherited = false): any | null {
    return this.valueFor(this._currentScopes, modelClass, skipInherited);
  }

  static setCurrentScope(modelClass: object, scope: any): void {
    this.setValueFor(this._currentScopes, modelClass, scope);
  }

  static ignoreDefaultScope(modelClass: object, skipInherited = false): any | null {
    return this.valueFor(this._ignoreDefaultScope, modelClass, skipInherited);
  }

  static setIgnoreDefaultScope(modelClass: object, value: any): void {
    this.setValueFor(this._ignoreDefaultScope, modelClass, value);
  }

  static globalCurrentScope(modelClass: object, skipInherited = false): any | null {
    return this.valueFor(this._globalCurrentScope, modelClass, skipInherited);
  }

  static setGlobalCurrentScope(modelClass: object, scope: any): void {
    this.setValueFor(this._globalCurrentScope, modelClass, scope);
  }

  // Rails: value_for(@registry, model, skip_inherited_scope)
  // Walks up the prototype chain unless skipInherited is true.
  private static valueFor(
    map: WeakMap<object, any>,
    modelClass: object,
    skipInherited: boolean,
  ): any | null {
    const value = map.get(modelClass);
    if (value !== undefined) return value;
    if (skipInherited) return null;
    const parent = Object.getPrototypeOf(modelClass);
    if (typeof parent === "function" && parent !== modelClass) {
      return this.valueFor(map, parent, false);
    }
    return null;
  }

  private static setValueFor(map: WeakMap<object, any>, modelClass: object, value: any): void {
    if (value === null) {
      map.delete(modelClass);
    } else {
      map.set(modelClass, value);
    }
  }
}

// ---------------------------------------------------------------------------
// Instance methods
// ---------------------------------------------------------------------------

interface ScopingHost {
  constructor: { scope_attributes?(): Record<string, unknown>; currentScope?: any };
  assignAttributes?(attrs: Record<string, unknown>): void;
}

export function populateWithCurrentScopeAttributes(this: ScopingHost): void {
  const klass = this.constructor as any;
  if (!klass.currentScope) return;
  const attrs = scopeAttributes.call(klass);
  if (attrs && Object.keys(attrs).length > 0 && this.assignAttributes) {
    this.assignAttributes(attrs);
  }
}

export function initializeInternalsCallback(this: ScopingHost): void {
  populateWithCurrentScopeAttributes.call(this);
}

// ---------------------------------------------------------------------------
// Class methods
// ---------------------------------------------------------------------------

interface ScopingClassHost {
  currentScope?: any;
  all?(): any;
}

export function scopeAttributes(this: ScopingClassHost): Record<string, unknown> {
  const all = this.all?.();
  return all?.scopeForCreate?.() ?? {};
}

export function isScopeAttributes(this: ScopingClassHost): boolean {
  return !!this.currentScope;
}

export function scopeRegistry(): ScopeRegistry {
  return ScopeRegistry.instance();
}
