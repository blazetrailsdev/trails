/**
 * ActionController::Caching
 *
 * Fragment caching support for controllers.
 * @see https://api.rubyonrails.org/classes/ActionController/Caching.html
 */

/** Host shape for the private `instrumentPayload` mixin reader. */
interface CachingInstrumentHost {
  controllerName(): string;
  actionName: string;
}

/**
 * Mirrors Rails `ActionController::Caching#instrument_payload` (private):
 *
 *     def instrument_payload(key)
 *       { controller: controller_name, action: action_name, key: key }
 *     end
 *
 * @internal
 */
export function instrumentPayload(
  this: CachingInstrumentHost,
  key: unknown,
): { controller: string; action: string; key: unknown } {
  return { controller: this.controllerName(), action: this.actionName, key };
}

/**
 * Mirrors Rails `ActionController::Caching#instrument_name` (private):
 *
 *     def instrument_name
 *       "action_controller"
 *     end
 *
 * @internal
 */
export function instrumentName(this: unknown): string {
  return "action_controller";
}

function serializeValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "object" && value !== null) {
    const toParam = (value as Record<string, unknown>).toParam;
    if (typeof toParam === "function") {
      return String(toParam.call(value));
    }
  }
  try {
    return stableStringify(value);
  } catch {
    return String(value);
  }
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") {
    const json = JSON.stringify(obj);
    return json === undefined ? String(obj) : json;
  }
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  // boundary: stable cache-key stringification handles legacy Date values.
  if (obj instanceof Date) return JSON.stringify(obj.toISOString());

  const record = obj as Record<string, unknown>;
  const keys = Object.keys(record);

  if (keys.length === 0) {
    const toJSON = (record as { toJSON?: () => unknown }).toJSON;
    if (typeof toJSON === "function") return JSON.stringify(toJSON.call(obj));
    const proto = Object.getPrototypeOf(obj);
    if (proto && proto !== Object.prototype) return JSON.stringify(String(obj));
  }

  const sorted = keys.sort();
  const pairs = sorted.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`);
  return `{${pairs.join(",")}}`;
}

export function fragmentCacheKey(
  key: string | string[] | Record<string, unknown>,
  controller?: string,
): string {
  if (typeof key === "string") {
    return controller ? `${controller}/${key}` : key;
  }
  if (Array.isArray(key)) {
    const parts = controller ? [controller, ...key] : key;
    return parts.join("/");
  }
  const sorted = Object.keys(key)
    .sort()
    .map((k) => `${k}=${serializeValue(key[k])}`)
    .join("/");
  return controller ? `${controller}/${sorted}` : sorted;
}
