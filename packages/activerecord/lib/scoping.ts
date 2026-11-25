import { IsolatedExecutionState } from "@blazetrails/activesupport";
import { assertAssignedSynchronously } from "@blazetrails/activemodel";
import { constSet, rbCallSuper } from "@blazetrails/ruby-compat";
import { ActiveRecord, Scoping } from "./namespaces.js";
import { isSchemaLoaded } from "./model-schema.js";
import type { Base } from "./base.js";
import type { Relation } from "./relation.js";

type Scope = Relation<any, boolean>;

const SCOPE_REGISTRY_KEY = "active_record_scope_registry";

export class ScopeRegistry {
  private readonly _currentScope: WeakMap<object, Scope>;
  private readonly _ignoreDefaultScope: WeakMap<object, boolean>;
  private readonly _globalCurrentScope: WeakMap<object, Scope>;

  constructor() {
    this._currentScope = new WeakMap();
    this._ignoreDefaultScope = new WeakMap();
    this._globalCurrentScope = new WeakMap();
  }

  static instance(): ScopeRegistry {
    return (
      IsolatedExecutionState.get<ScopeRegistry>(SCOPE_REGISTRY_KEY) ??
      IsolatedExecutionState.set(SCOPE_REGISTRY_KEY, new ScopeRegistry())
    );
  }

  currentScope(model: object, skipInheritedScope = false): Scope | null {
    return valueFor(this._currentScope, model, skipInheritedScope);
  }

  setCurrentScope(model: object, value: Scope | null): void {
    setValueFor(this._currentScope, model, value);
  }

  ignoreDefaultScope(model: object, skipInheritedScope = false): boolean | null {
    return valueFor(this._ignoreDefaultScope, model, skipInheritedScope);
  }

  setIgnoreDefaultScope(model: object, value: boolean | null): void {
    setValueFor(this._ignoreDefaultScope, model, value);
  }

  globalCurrentScope(model: object, skipInheritedScope = false): Scope | null {
    return valueFor(this._globalCurrentScope, model, skipInheritedScope);
  }

  setGlobalCurrentScope(model: object, value: Scope | null): void {
    setValueFor(this._globalCurrentScope, model, value);
  }

  static currentScope(model: object, skipInheritedScope = false): Scope | null {
    return this.instance().currentScope(model, skipInheritedScope);
  }
  static setCurrentScope(model: object, value: Scope | null): void {
    this.instance().setCurrentScope(model, value);
  }
  static ignoreDefaultScope(model: object, skipInheritedScope = false): boolean | null {
    return this.instance().ignoreDefaultScope(model, skipInheritedScope);
  }
  static setIgnoreDefaultScope(model: object, value: boolean | null): void {
    this.instance().setIgnoreDefaultScope(model, value);
  }
  static globalCurrentScope(model: object, skipInheritedScope = false): Scope | null {
    return this.instance().globalCurrentScope(model, skipInheritedScope);
  }
  static setGlobalCurrentScope(model: object, value: Scope | null): void {
    this.instance().setGlobalCurrentScope(model, value);
  }
}

/** @internal */
function valueFor<T>(
  scopeType: WeakMap<object, T>,
  model: object,
  skipInheritedScope: boolean,
): T | null {
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
function setValueFor<T>(scopeType: WeakMap<object, T>, model: object, value: T | null): void {
  if (value === null) {
    scopeType.delete(model);
  } else {
    scopeType.set(model, value);
  }
}

interface ScopingHost {
  constructor: typeof Base;
  /** @internal */
  _assignAttributes(attrs: Record<string, unknown>): Promise<void> | void;
}

/** @inventedArm if — PERMANENT */
export function populateWithCurrentScopeAttributes(this: ScopingHost): void {
  const klass = this.constructor;
  if (!klass.isScopeAttributes()) return;

  let attributes = scopeAttributes.call(klass);
  if (!isSchemaLoaded.call(klass)) {
    attributes = Object.fromEntries(
      Object.entries(attributes).filter(([name]) => klass.hasAttribute(name)),
    );
  }
  if (Object.keys(attributes).length !== 0) {
    assertAssignedSynchronously(
      this._assignAttributes(attributes),
      "populateWithCurrentScopeAttributes",
    );
  }
}

export function initializeInternalsCallback(this: ScopingHost): void {
  rbCallSuper(this, initializeInternalsCallback);
  populateWithCurrentScopeAttributes.call(this);
}

Object.assign(Scoping, {
  initializeInternalsCallback,
});

interface ScopingClassHost {
  currentScope?(skipInheritedScope?: boolean): unknown;
  all?(): Scope;
}

export function scopeAttributes(this: ScopingClassHost): Record<string, unknown> {
  const all = this.all?.();
  return all?.scopeForCreate?.() ?? {};
}

export function isScopeAttributes(this: ScopingClassHost): boolean {
  return !!this.currentScope?.();
}

export function setCurrentScope(this: ScopingClassHost, scope: Scope | null): void {
  ScopeRegistry.setCurrentScope(this, scope);
}

export function globalCurrentScope(
  this: ScopingClassHost,
  skipInheritedScope = false,
): Scope | null {
  return ScopeRegistry.globalCurrentScope(this, skipInheritedScope);
}

export function setGlobalCurrentScope(this: ScopingClassHost, scope: Scope | null): void {
  ScopeRegistry.setGlobalCurrentScope(this, scope);
}

export function scopeRegistry(): ScopeRegistry {
  return ScopeRegistry.instance();
}

constSet(ActiveRecord, "Scoping", Scoping);
