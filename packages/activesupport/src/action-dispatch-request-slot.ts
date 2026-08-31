/** @noRailsEquivalent PERMANENT */
export type ActionDispatchRequestConstructor = new (env: Record<string, unknown>) => unknown;

/** @internal */
export let _ActionDispatchRequest: ActionDispatchRequestConstructor | undefined;

/** @internal */
export function _setActionDispatchRequest(ctor: ActionDispatchRequestConstructor): void {
  _ActionDispatchRequest = ctor;
}
