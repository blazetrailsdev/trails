/**
 * Shared helpers for DatabaseTasks and the per-adapter task classes.
 */

export function coercePort(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}
