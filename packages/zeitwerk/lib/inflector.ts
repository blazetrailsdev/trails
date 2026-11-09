import { capitalize, stringSplit } from "@blazetrails/ruby-compat";

export class Inflector {
  private _overrides?: Record<string, string>;

  /** @missingRailsArgs join — PERMANENT */
  camelize(basename: string, _abspath: string | null): string {
    return (
      this.overrides()[basename] ??
      stringSplit(basename, "_")
        .map((s) => capitalize(s, []))
        .join("")
    );
  }

  inflect(inflections: Record<string, string>): void {
    Object.assign(this.overrides(), inflections);
  }

  /** @internal */
  private overrides(): Record<string, string> {
    return (this._overrides ??= Object.create(null) as Record<string, string>);
  }
}
