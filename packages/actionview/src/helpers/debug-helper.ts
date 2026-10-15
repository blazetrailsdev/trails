import { SafeBuffer, htmlEscape } from "@blazetrails/activesupport";
import { Exception, LoadError, Marshal, StandardError } from "@blazetrails/ruby-compat";
import { toYaml } from "@blazetrails/ruby-compat/yaml";
import { contentTag, type TagHelperHost } from "./tag-helper.js";

export function debug(this: TagHelperHost, object: unknown): SafeBuffer {
  try {
    Marshal.dump(object);
    object = htmlEscape(toYaml(object));
    return contentTag.call(this, "pre", object, { class: "debug_dump" });
  } catch (error) {
    if (
      error instanceof LoadError ||
      (error instanceof Exception && !(error instanceof StandardError))
    )
      throw error;
    return contentTag.call(this, "code", inspect(object), { class: "debug_dump" });
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

  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((v) => inspect(v, seen)).join(", ")}]`;
    }
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${k}: ${inspect(v, seen)}`,
    );
    return `{ ${entries.join(", ")} }`;
  } finally {
    seen.delete(value);
  }
}
