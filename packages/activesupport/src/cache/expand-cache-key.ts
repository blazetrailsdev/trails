import { env } from "../process-adapter.js";

export function expandCacheKey(key: unknown, namespace?: string | symbol): string {
  const prefix = namespace !== undefined ? `${String(namespace)}/` : "";
  const version = env["RAILS_CACHE_ID"] ?? env["RAILS_APP_VERSION"];
  const versionPrefix = version ? `${version}/` : "";
  return `${prefix}${versionPrefix}${expandKey(key)}`;
}

function expandKey(key: unknown): string {
  if (key === null || key === undefined) return "";
  if (typeof key === "boolean") return String(key);
  if (typeof key === "object" && key !== null) {
    if (typeof (key as { cacheKey?: unknown }).cacheKey === "function") {
      return String((key as { cacheKey(): unknown }).cacheKey());
    }
    if (Symbol.iterator in (key as object)) {
      return [...(key as Iterable<unknown>)].map(expandKey).join("/");
    }
  }
  return String(key);
}
