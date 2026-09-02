const registry = new Map<unknown, string>();

/** @noRailsEquivalent PERMANENT */
export function setRubyClassPath(klass: unknown, path: string): void {
  registry.set(klass, path);
}

/** @noRailsEquivalent PERMANENT */
export function getRubyClassPath(klass: unknown): string | undefined {
  return registry.get(klass);
}
