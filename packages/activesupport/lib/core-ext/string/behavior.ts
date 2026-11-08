export function actsLikeString(self: unknown): boolean {
  return typeof self === "string" || self instanceof String;
}
