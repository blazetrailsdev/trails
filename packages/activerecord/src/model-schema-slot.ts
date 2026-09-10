/** @internal */
export let _deriveJoinTableName: ((firstTable: string, secondTable: string) => string) | undefined;

/** @internal */
export function _setDeriveJoinTableName(
  fn: (firstTable: string, secondTable: string) => string,
): void {
  _deriveJoinTableName = fn;
}
