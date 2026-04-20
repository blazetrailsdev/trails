// Late-bound CollectionProxy constructor slot, extracted into a module
// with ZERO imports so it cannot participate in any import cycle.
//
// Why this exists: CollectionProxy `extends Relation`, which transitively
// drags in `base.ts` and `associations.ts`. Value-importing
// CollectionProxy from `associations.ts` at module init would observe
// a partial `associations.ts` during the cycle. This slot lets
// `associations.ts` construct a CP via a registered ctor instead.
//
// The CP module sets this on load (self-registration at the bottom of
// `collection-proxy.ts`); `associations.ts` reads it. Placing the slot
// here — with no imports — guarantees its top-level binding runs
// before any cycle participant touches it, so neither `let` nor TDZ
// hazards apply.

/** @internal */

export let _CollectionProxyCtor: (new (...args: any[]) => any) | undefined;

/** @internal */

export function _setCollectionProxyCtor(ctor: new (...args: any[]) => any): void {
  _CollectionProxyCtor = ctor;
}
