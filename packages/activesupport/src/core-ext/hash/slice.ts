type AnyObject = Record<string, unknown>;

/**
 * Removes and returns the key/value pairs matching the given keys, mutating
 * the receiver — Ruby's `Hash#extract!` (core_ext/hash/slice.rb:24-26).
 */
export function extractBang<T extends AnyObject>(obj: T, ...keys: string[]): Partial<T> {
  const result: Partial<T> = {};
  for (const key of keys) {
    if (key in obj) {
      result[key as keyof T] = obj[key as keyof T];
      delete obj[key as keyof T];
    }
  }
  return result;
}
