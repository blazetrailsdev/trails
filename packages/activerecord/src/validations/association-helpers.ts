import { isMarkedForDestruction } from "../autosave-association.js";

export function isAssociation(record: any, attribute: string): boolean {
  const associations: any[] = record.constructor._associations ?? [];
  return associations.some((a: any) => a.name === attribute);
}

export function resolveAssociation(record: any, attribute: string, fallback: unknown): unknown {
  // Check cached/preloaded associations first
  const cached = record._cachedAssociations?.get?.(attribute);
  if (cached !== undefined) return cached;
  const preloaded = record._preloadedAssociations?.get?.(attribute);
  if (preloaded !== undefined) return preloaded;

  // Check collection proxies — only use when loaded or has in-memory records
  const proxy = record._collectionProxies?.get?.(attribute);
  if (
    proxy &&
    (proxy.loaded === true || (Array.isArray(proxy.target) && proxy.target.length > 0))
  ) {
    return proxy.target;
  }

  // Only use association target when actually loaded
  if (typeof record.association === "function" && isAssociation(record, attribute)) {
    const assoc = record.association(attribute);
    if (assoc?.loaded === true && assoc.target !== undefined) return assoc.target;
  }

  if (attribute in record) return record[attribute];
  return fallback;
}

export function filterDestroyed(value: unknown): unknown {
  if (Array.isArray(value)) {
    const filtered = value.filter((v: any) => !isMarkedForDestruction(v));
    return filtered.length > 0 ? filtered : null;
  }
  if (value && isMarkedForDestruction(value as any)) {
    return null;
  }
  return value;
}
