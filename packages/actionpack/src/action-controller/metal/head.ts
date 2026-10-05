/** @internal */
export function includeContent(status: number): boolean {
  if (status >= 100 && status <= 199) return false;
  if (status === 204 || status === 205 || status === 304) return false;
  return true;
}
