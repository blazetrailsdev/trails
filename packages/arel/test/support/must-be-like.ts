/** @internal */
export function mustBeLike(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}
