/** @noRailsEquivalent CONVERGEABLE converge-relation-deferred-and-thenable-machinery */
export function isBaseInstance(value: unknown): value is { id: unknown } {
  if (value === null || typeof value !== "object") return false;
  const ctor = (value as { constructor?: { _isActiveRecordBase?: unknown } }).constructor;
  return ctor?._isActiveRecordBase === true;
}
