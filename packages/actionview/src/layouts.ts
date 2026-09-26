/** @internal */
export function _normalizeLayout<T>(value: T): T | string {
  return typeof value === "string" && !/\blayouts/.test(value) ? `layouts/${value}` : value;
}
