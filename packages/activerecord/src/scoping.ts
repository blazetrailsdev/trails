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

  currentScope(model: object, skipInheritedScope = false): any | null {
    return valueFor(this._currentScopes, model, skipInheritedScope);
  }

  setCurrentScope(model: object, value: any): void {
    setValueFor(this._currentScopes, model, value);
  }

  ignoreDefaultScope(model: object, skipInheritedScope = false): any | null {
    return valueFor(this._ignoreDefaultScope, model, skipInheritedScope);
  }

  setIgnoreDefaultScope(model: object, value: any): void {
    setValueFor(this._ignoreDefaultScope, model, value);
  }

  globalCurrentScope(model: object, skipInheritedScope = false): any | null {
    return valueFor(this._globalCurrentScope, model, skipInheritedScope);
  }

  setGlobalCurrentScope(model: object, value: any): void {
    setValueFor(this._globalCurrentScope, model, value);
  }

  static currentScope(model: object, skipInheritedScope = false): any | null {
    return this.instance().currentScope(model, skipInheritedScope);
  }
  static setCurrentScope(model: object, value: any): void {
    this.instance().setCurrentScope(model, value);
  }
  static ignoreDefaultScope(model: object, skipInheritedScope = false): any | null {
    return this.instance().ignoreDefaultScope(model, skipInheritedScope);
  }
  static setIgnoreDefaultScope(model: object, value: any): void {
    this.instance().setIgnoreDefaultScope(model, value);
  }
  static globalCurrentScope(model: object, skipInheritedScope = false): any | null {
    return this.instance().globalCurrentScope(model, skipInheritedScope);
  }
  static setGlobalCurrentScope(model: object, value: any): void {
    this.instance().setGlobalCurrentScope(model, value);
  }
}

/** @internal */
function valueFor(
  scopeType: WeakMap<object, any>,
  model: object,
  skipInheritedScope: boolean,
): any | null {
  const value = scopeType.get(model);
  if (value !== undefined) return value;
  if (skipInheritedScope) return null;
  const parent = Object.getPrototypeOf(model);
  if (typeof parent === "function" && parent !== model) {
    return valueFor(scopeType, parent, false);
  }
  return null;
}

/** @internal */
function setValueFor(scopeType: WeakMap<object, any>, model: object, value: any): void {
  if (value === null) {
    scopeType.delete(model);
  } else {
    scopeType.set(model, value);
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
