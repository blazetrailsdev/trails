/**
 * @internal
 *
 * Standalone module for the adapter-set hook so both base.ts and
 * associations.ts can reach it without creating a circular value
 * import. base.ts imports * as _Associations from associations.ts
 * eagerly to wire .belongsTo/.hasOne/.hasMany; if associations.ts
 * imports a value from base.ts, that value isn't defined yet on the
 * first pass and the test "registers CollectionProxy ... after
 * module reset" trips on `_Associations.belongsTo` being undefined.
 *
 * The hook itself is consumed by the test-adapter
 * (packages/activerecord/src/test-adapter.ts), which calls
 * `setOnAdapterSetHook(registerModel)` at module load. When a model's
 * adapter is assigned, base.ts calls `fireAdapterSetHook(model)` to
 * notify the test-adapter. HABTM's anonymous JoinModel uses a getter
 * for `adapter`, so its setter is a no-op; createHabtmJoinModel
 * fires the hook manually so the test-adapter learns about the
 * join table just like any other model.
 */

let _onAdapterSet: ((modelClass: any) => void) | null = null;

export function setOnAdapterSetHook(hook: ((modelClass: any) => void) | null): void {
  _onAdapterSet = hook;
}

export function fireAdapterSetHook(modelClass: any): void {
  if (_onAdapterSet) _onAdapterSet(modelClass);
}
