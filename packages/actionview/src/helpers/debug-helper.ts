import { SafeBuffer } from "@blazetrails/activesupport";
import { stringify } from "@blazetrails/activesupport/yaml";
import { contentTag } from "./tag-helper.js";
import { htmlEscape } from "./output-safety-helper.js";

/**
 * debug — returns a YAML representation of `object` wrapped with `<pre>`.
 * Falls back to a recursive inspect-style rendering (objects as
 * `{ key: value, … }`, arrays as `[v, …]`, cycles as `[Circular]`) inside
 * `<code>` if YAML serialization throws. Mirrors
 * `ActionView::Helpers::DebugHelper#debug`'s Marshal/YAML rescue path.
 */
export function debug(object: unknown): SafeBuffer {
  try {
    const yaml = stringify(object);
    return contentTag("pre", htmlEscape(yaml), { class: "debug_dump" });
  } catch {
    return contentTag("code", inspect(object), { class: "debug_dump" });
  }
}

function inspect(value: unknown, seen: WeakSet<object> = new WeakSet()): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function") {
    const name = (value as { name?: string }).name;
    return `[Function${name ? `: ${name}` : " (anonymous)"}]`;
  }
  if (typeof value !== "object") return String(value);

  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((v) => inspect(v, seen)).join(", ")}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${inspect(v, seen)}`,
    );
    return `{ ${entries.join(", ")} }`;
  } finally {
    seen.delete(value as object);
  }
}
