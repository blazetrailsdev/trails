export function recycleBang(this: Record<string, unknown>): void {
  this._urlOptions = null;
  this.formats = null;
  this.params = null;
}

export function clearInstanceVariablesBetweenRequests(
  controller: Record<string, unknown>,
  trackedVars: Set<string>,
): Set<string> {
  for (const key of Object.keys(controller)) {
    if (!trackedVars.has(key)) {
      delete controller[key];
    }
  }
  return new Set(Object.keys(controller));
}
