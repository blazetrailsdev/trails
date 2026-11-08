export function startsWith(str: string, ...prefixes: string[]): boolean {
  return prefixes.some((prefix) => str.startsWith(prefix));
}

export function endsWith(str: string, ...suffixes: string[]): boolean {
  return suffixes.some((suffix) => str.endsWith(suffix));
}
