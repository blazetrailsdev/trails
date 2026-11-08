/** @internal */
export function uniq<T>(array: readonly T[]): T[] {
  const result: T[] = [];
  for (const item of array) {
    if (!result.some((seen) => (seen as { eql(o: unknown): boolean }).eql(item))) result.push(item);
  }
  return result;
}
