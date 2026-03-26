import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";

/**
 * Base class for all association proxies. An Association wraps a single
 * association between an owner record and its target(s).
 *
 * In Rails, each record lazily creates Association instances via
 * `record.association(:name)`. The instance manages loading, caching,
 * and lifecycle for that association on that specific record.
 *
 * Mirrors: ActiveRecord::Associations::Association
 */
export class Association {
  readonly owner: Base;
  readonly definition: AssociationDefinition;
  loaded: boolean;
  target: Base | Base[] | null;

  constructor(owner: Base, definition: AssociationDefinition) {
    this.owner = owner;
    this.definition = definition;
    this.loaded = false;
    this.target = null;
  }

  get name(): string {
    return this.definition.name;
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  isStale(): boolean {
    return false;
  }

  reset(): void {
    this.loaded = false;
    this.target = null;
  }

  reload(): this {
    this.reset();
    return this;
  }

  setTarget(target: Base | Base[] | null): void {
    this.target = target;
    this.loaded = true;
  }

  get reader(): Base | Base[] | null {
    return this.target;
  }
}
