export function camelize(s: string): string {
  return s
    .replace(/[_-](\w)/g, (_, c: string) => c.toUpperCase())
    .replace(/^(\w)/, (_, c: string) => c.toUpperCase());
}
