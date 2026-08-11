import { IsolatedExecutionState } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import { parkNestedReaderLoad } from "./nested-attributes.js";

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

  currentScope(modelClass: object, skipInheritedScope = false): any | null {
    return valueFor(this._currentScopes, modelClass, skipInheritedScope);
  }

  setCurrentScope(modelClass: object, scope: any): void {
    setValueFor(this._currentScopes, modelClass, scope);
  }

  ignoreDefaultScope(modelClass: object, skipInheritedScope = false): any | null {
    return valueFor(this._ignoreDefaultScope, modelClass, skipInheritedScope);
  }

  setIgnoreDefaultScope(modelClass: object, value: any): void {
    setValueFor(this._ignoreDefaultScope, modelClass, value);
  }

  globalCurrentScope(modelClass: object, skipInheritedScope = false): any | null {
    return valueFor(this._globalCurrentScope, modelClass, skipInheritedScope);
  }

  setGlobalCurrentScope(modelClass: object, scope: any): void {
    setValueFor(this._globalCurrentScope, modelClass, scope);
  }

  // Class-method delegators — Rails uses `delegate :current_scope, …, to: :instance`.
  static currentScope(modelClass: object, skipInheritedScope = false): any | null {
    return this.instance().currentScope(modelClass, skipInheritedScope);
  }
  static setCurrentScope(modelClass: object, scope: any): void {
    this.instance().setCurrentScope(modelClass, scope);
  }
  static ignoreDefaultScope(modelClass: object, skipInheritedScope = false): any | null {
    return this.instance().ignoreDefaultScope(modelClass, skipInheritedScope);
  }
  static setIgnoreDefaultScope(modelClass: object, value: any): void {
    this.instance().setIgnoreDefaultScope(modelClass, value);
  }
  static globalCurrentScope(modelClass: object, skipInheritedScope = false): any | null {
    return this.instance().globalCurrentScope(modelClass, skipInheritedScope);
  }
  static setGlobalCurrentScope(modelClass: object, scope: any): void {
    this.instance().setGlobalCurrentScope(modelClass, scope);
  }
}

// Rails: value_for(@registry, model, skip_inherited_scope).
// Walks up the prototype chain unless skipInheritedScope is true.
/** @internal */
function valueFor(
  map: WeakMap<object, any>,
  modelClass: object,
  skipInheritedScope: boolean,
): any | null {
  const value = map.get(modelClass);
  if (value !== undefined) return value;
  if (skipInheritedScope) return null;
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
  constructor: { isScopeAttributes(): boolean };
  assignAttributes?(attrs: Record<string, unknown>): Promise<void> | void;
}

/**
 * Mirrors: ActiveRecord::Scoping#populate_with_current_scope_attributes
 * (scoping.rb:60-66). Runs from `initialize` (core.rb:474), which a JS
 * constructor cannot await, so the assignment is parked on the record for `save`
 * to drain — see `_applyScopeAttributes` (base.ts).
 */
export function populateWithCurrentScopeAttributes(this: ScopingHost): void {
  const klass = this.constructor as any;
  if (!klass.isScopeAttributes()) return;
  const attrs = scopeAttributes.call(klass);
  if (attrs && Object.keys(attrs).length > 0 && this.assignAttributes) {
    const pending = this.assignAttributes(attrs);
    if (pending) parkNestedReaderLoad(this as unknown as Base, pending);
  }
}

export function initializeInternalsCallback(this: ScopingHost): void {
  populateWithCurrentScopeAttributes.call(this);
}

// ---------------------------------------------------------------------------
// Class methods
// ---------------------------------------------------------------------------

interface ScopingClassHost {
  currentScope?(skipInheritedScope?: boolean): any;
  all?(): any;
}

export function scopeAttributes(this: ScopingClassHost): Record<string, unknown> {
  const all = this.all?.();
  return all?.scopeForCreate?.() ?? {};
}

export function isScopeAttributes(this: ScopingClassHost): boolean {
  return !!this.currentScope?.();
}

/**
 * Mirrors: ActiveRecord::Scoping::ClassMethods#current_scope=
 * (scoping.rb:29-31). Ruby's `current_scope=` cannot be a TS `set` accessor
 * here (callers pass through delegation hosts), so it keeps the Rails name as
 * `setCurrentScope`.
 */
export function setCurrentScope(this: ScopingClassHost, scope: any): void {
  ScopeRegistry.setCurrentScope(this as unknown as object, scope);
}

/**
 * Mirrors: ActiveRecord::Scoping::ClassMethods#global_current_scope
 * (scoping.rb:34-36).
 */
export function globalCurrentScope(this: ScopingClassHost, skipInheritedScope = false): any | null {
  return ScopeRegistry.globalCurrentScope(this as unknown as object, skipInheritedScope);
}

/**
 * Mirrors: ActiveRecord::Scoping::ClassMethods#global_current_scope=
 * (scoping.rb:37-39).
 */
export function setGlobalCurrentScope(this: ScopingClassHost, scope: any): void {
  ScopeRegistry.setGlobalCurrentScope(this as unknown as object, scope);
}

export function scopeRegistry(): ScopeRegistry {
  return ScopeRegistry.instance();
}

/**
 * Rails: `class_attribute :default_scope_override` (default nil) — whether the
 * model defines its own `default_scope`. Like Rails, this stays nil until
 * `build_default_scope` first runs and memoizes the boolean into the
 * `_defaultScopeOverride` class field (see scoping/default.ts); reading it
 * before then returns nil, not an eagerly-computed boolean.
 *
 * Mirrors: ActiveRecord::Scoping#default_scope_override
 */
export function defaultScopeOverride(this: ScopingClassHost): boolean | null {
  const value = (this as any)._defaultScopeOverride;
  return value == null ? null : value;
}
