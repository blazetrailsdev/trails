import { SafeBuffer } from "@blazetrails/activesupport";
import { stringify } from "@blazetrails/activesupport/yaml";
import { contentTag } from "./tag-helper.js";
import { htmlEscape } from "./ejs-util.js";

/**
 * debug — returns a YAML representation of `object` wrapped with `<pre>`.
 * Falls back to a best-effort JSON / `Object.prototype.toString` rendering
 * inside `<code>` if YAML serialization throws (e.g. circular references).
 * Mirrors `ActionView::Helpers::DebugHelper#debug`'s Marshal/YAML rescue path.
 */
export function debug(object: unknown): SafeBuffer {
  try {
    const yaml = stringify(object);
    return contentTag("pre", htmlEscape(yaml), { class: "debug_dump" });
  } catch {
    return contentTag("code", inspect(object), { class: "debug_dump" });
  }
}

function inspect(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "bigint") return `${value.toString()}n`;
  if (typeof value === "function") return value.toString();
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}
