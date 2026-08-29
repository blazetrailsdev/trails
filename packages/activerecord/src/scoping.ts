import { IsolatedExecutionState } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import { parkNestedReaderLoad } from "./nested-attributes.js";

const SCOPE_REGISTRY_KEY = "active_record_scope_registry";

export class Scoping {
  static scopeFor(modelClass: any): any | null {
    return ScopeRegistry.currentScope(modelClass);
  }
}

export class ScopeRegistry {
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

interface ScopingHost {
  constructor: { isScopeAttributes(): boolean };
  assignAttributes?(attrs: Record<string, unknown>): Promise<void> | void;
}

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

export function setCurrentScope(this: ScopingClassHost, scope: any): void {
  ScopeRegistry.setCurrentScope(this as unknown as object, scope);
}

export function globalCurrentScope(this: ScopingClassHost, skipInheritedScope = false): any | null {
  return ScopeRegistry.globalCurrentScope(this as unknown as object, skipInheritedScope);
}

export function setGlobalCurrentScope(this: ScopingClassHost, scope: any): void {
  ScopeRegistry.setGlobalCurrentScope(this as unknown as object, scope);
}

export function scopeRegistry(): ScopeRegistry {
  return ScopeRegistry.instance();
}
