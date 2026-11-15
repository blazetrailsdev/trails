export interface CommandOption {
  type?: "boolean" | "string";
  default?: unknown;
  values?: string[];
  aliases?: string[];
  desc?: string;
}

/** @noRailsEquivalent PERMANENT */
export class Command {
  /** @internal */
  static _description: string | null = null;
  /** @internal */
  static _options: Record<string, CommandOption> = {};

  static desc(description: string): void {
    this._description = description;
  }

  static option(name: string, options: CommandOption = {}): void {
    if (!Object.hasOwn(this, "_options")) this._options = { ...this._options };
    this._options[name] = options;
  }

  call(_options: Record<string, unknown>): unknown {
    return undefined;
  }
}
