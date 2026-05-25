/** Rejects excess keys even for variable-typed arguments (closes the TS excess-property check gap). */
export type NoExtraKeys<T> = T & { [K in Exclude<string, keyof T>]?: never };

/** Mirrors Rails `ActionView::Template::StrictLocalsError`. */
export class StrictLocalsMismatch extends Error {
  readonly extraKeys: readonly string[];
  readonly allowedKeys: readonly string[];

  constructor(extraKeys: string[], allowedKeys: string[]) {
    const extra = extraKeys.map((k) => JSON.stringify(k)).join(", ");
    const allowed =
      allowedKeys.length === 0 ? "(none)" : allowedKeys.map((k) => JSON.stringify(k)).join(", ");
    super(
      `unknown local${extraKeys.length === 1 ? "" : "s"} ${extra} passed to template; ` +
        `allowed: ${allowed}`,
    );
    this.name = "ActionView::Template::StrictLocalsError";
    this.extraKeys = extraKeys;
    this.allowedKeys = allowedKeys;
  }
}
