/**
 * Temporal types carry a `Temporal.X` `Symbol.toStringTag`. Reading it keeps
 * Temporal checks structural rather than pulling the namespace into arel's
 * runtime imports — arel has no activesupport dependency at runtime.
 *
 * Shared by the visitors so the tag-shape knowledge lives in one place; each
 * caller maps the tag to its own Rails analogue (to-sql dispatches on
 * supported-vs-unsupported, dot labels leaf nodes with a Ruby class name).
 *
 * @internal
 */
export function temporalTag(v: unknown): string | null {
  if (typeof v !== "object" || v === null) return null;
  const tag = (v as Record<symbol, unknown>)[Symbol.toStringTag];
  return typeof tag === "string" && tag.startsWith("Temporal.") ? tag : null;
}
