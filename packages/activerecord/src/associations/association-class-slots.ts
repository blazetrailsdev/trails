import type { BelongsToAssociation } from "./belongs-to-association.js";
import type { BelongsToPolymorphicAssociation } from "./belongs-to-polymorphic-association.js";
import type { HasManyAssociation } from "./has-many-association.js";
import type { HasManyThroughAssociation } from "./has-many-through-association.js";
import type { HasOneAssociation } from "./has-one-association.js";
import type { HasOneThroughAssociation } from "./has-one-through-association.js";

/** @internal */
export let _BelongsToAssociation: typeof BelongsToAssociation | undefined;
/** @internal */
export function _setBelongsToAssociation(ctor: typeof BelongsToAssociation): void {
  _BelongsToAssociation = ctor;
}

/** @internal */
export let _BelongsToPolymorphicAssociation: typeof BelongsToPolymorphicAssociation | undefined;
/** @internal */
export function _setBelongsToPolymorphicAssociation(
  ctor: typeof BelongsToPolymorphicAssociation,
): void {
  _BelongsToPolymorphicAssociation = ctor;
}

/** @internal */
export let _HasManyAssociation: typeof HasManyAssociation | undefined;
/** @internal */
export function _setHasManyAssociation(ctor: typeof HasManyAssociation): void {
  _HasManyAssociation = ctor;
}

/** @internal */
export let _HasManyThroughAssociation: typeof HasManyThroughAssociation | undefined;
/** @internal */
export function _setHasManyThroughAssociation(ctor: typeof HasManyThroughAssociation): void {
  _HasManyThroughAssociation = ctor;
}

/** @internal */
export let _HasOneAssociation: typeof HasOneAssociation | undefined;
/** @internal */
export function _setHasOneAssociation(ctor: typeof HasOneAssociation): void {
  _HasOneAssociation = ctor;
}

/** @internal */
export let _HasOneThroughAssociation: typeof HasOneThroughAssociation | undefined;
/** @internal */
export function _setHasOneThroughAssociation(ctor: typeof HasOneThroughAssociation): void {
  _HasOneThroughAssociation = ctor;
}
