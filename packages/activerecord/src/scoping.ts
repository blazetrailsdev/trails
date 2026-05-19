import { IsolatedExecutionState } from "@blazetrails/activesupport";

const SCOPE_REGISTRY_KEY = "active_record_scope_registry";

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
  // Rails: `@current_scope = {}` etc on the instance — per-fiber-isolated
  // because `instance()` itself is per-fiber via IsolatedExecutionState.
  // We use WeakMap (model class as key) instead of Rails' string-keyed Hash
  // (model.name) so anonymous classes work and model classes can be GC'd.
  private readonly _currentScopes: WeakMap<object, any> = new WeakMap();
  private readonly _ignoreDefaultScope: WeakMap<object, any> = new WeakMap();
  private readonly _globalCurrentScope: WeakMap<object, any> = new WeakMap();

  static instance(): ScopeRegistry {
    return IsolatedExecutionState.fetch(SCOPE_REGISTRY_KEY, () => new ScopeRegistry());
  }

  currentScope(modelClass: object, skipInherited = false): any | null {
    return valueFor(this._currentScopes, modelClass, skipInherited);
  }

  setCurrentScope(modelClass: object, scope: any): void {
    setValueFor(this._currentScopes, modelClass, scope);
  }

  ignoreDefaultScope(modelClass: object, skipInherited = false): any | null {
    return valueFor(this._ignoreDefaultScope, modelClass, skipInherited);
  }

  setIgnoreDefaultScope(modelClass: object, value: any): void {
    setValueFor(this._ignoreDefaultScope, modelClass, value);
  }

  globalCurrentScope(modelClass: object, skipInherited = false): any | null {
    return valueFor(this._globalCurrentScope, modelClass, skipInherited);
  }

  setGlobalCurrentScope(modelClass: object, scope: any): void {
    setValueFor(this._globalCurrentScope, modelClass, scope);
  }

  // Class-method delegators — Rails uses `delegate :current_scope, …, to: :instance`.
  static currentScope(modelClass: object, skipInherited = false): any | null {
    return this.instance().currentScope(modelClass, skipInherited);
  }
  static setCurrentScope(modelClass: object, scope: any): void {
    this.instance().setCurrentScope(modelClass, scope);
  }
  static ignoreDefaultScope(modelClass: object, skipInherited = false): any | null {
    return this.instance().ignoreDefaultScope(modelClass, skipInherited);
  }
  static setIgnoreDefaultScope(modelClass: object, value: any): void {
    this.instance().setIgnoreDefaultScope(modelClass, value);
  }
  static globalCurrentScope(modelClass: object, skipInherited = false): any | null {
    return this.instance().globalCurrentScope(modelClass, skipInherited);
  }
  static setGlobalCurrentScope(modelClass: object, scope: any): void {
    this.instance().setGlobalCurrentScope(modelClass, scope);
  }
}

// Rails: value_for(@registry, model, skip_inherited_scope).
// Walks up the prototype chain unless skipInherited is true.
/** @internal */
function valueFor(
  map: WeakMap<object, any>,
  modelClass: object,
  skipInherited: boolean,
): any | null {
  const value = map.get(modelClass);
  if (value !== undefined) return value;
  if (skipInherited) return null;
  const parent = Object.getPrototypeOf(modelClass);
  if (typeof parent === "function" && parent !== modelClass) {
    return valueFor(map, parent, false);
  }
  return null;
}

/** @internal */
function setValueFor(map: WeakMap<object, any>, modelClass: object, value: any): void {
  if (value === null) {
    map.delete(modelClass);
  } else {
    map.set(modelClass, value);
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
