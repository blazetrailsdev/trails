import { env } from "../process-adapter.js";

export function expandCacheKey(key: unknown, namespace?: string): string {
  const prefix = namespace !== undefined ? `${String(namespace)}/` : "";
  const version = env["RAILS_CACHE_ID"] ?? env["RAILS_APP_VERSION"];
  const versionPrefix = version ? `${version}/` : "";
  return `${prefix}${versionPrefix}${expandKey(key)}`;
}

type CacheKeyable = {
  cacheKeyWithVersion?: () => unknown;
  cacheKey?: () => unknown;
};

function expandKey(key: unknown): string {
  if (key === null || key === undefined) return "";
  if (typeof key === "boolean") return String(key);
  if (typeof key === "object" && key !== null) {
    const obj = key as CacheKeyable;
    if (typeof obj.cacheKeyWithVersion === "function") {
      return String(obj.cacheKeyWithVersion());
    }
    if (typeof obj.cacheKey === "function") {
      return String(obj.cacheKey());
    }
    if (Array.isArray(key)) {
      return key.map(expandKey).join("/");
    }
    if (Symbol.iterator in (key as object)) {
      return [...(key as Iterable<unknown>)].map(expandKey).join("/");
    }
  }
  return String(key);
}
