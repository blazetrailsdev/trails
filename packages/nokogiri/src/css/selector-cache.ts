import type { XPathVisitor } from "./xpath-visitor.js";

let cache = new Map<string, string[]>();

export const SelectorCache = {
  get(key: string): string[] | undefined {
    return cache.get(key);
  },

  set(key: string, value: string[]): string[] {
    cache.set(key, value);
    return value;
  },

  clearCache(createNewObject = false): void {
    if (createNewObject) {
      cache = new Map();
    } else {
      cache.clear();
    }
  },

  key({ selector, visitor }: { selector: string; visitor: XPathVisitor }): string {
    const config = visitor.config();
    const namespaces =
      config.namespaces && Object.fromEntries(Object.entries(config.namespaces).sort());
    return JSON.stringify([selector, { ...config, namespaces }]);
  },
};
