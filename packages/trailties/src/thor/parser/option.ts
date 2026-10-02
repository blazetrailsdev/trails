import {
  ArgumentError,
  capitalize,
  fetch,
  hasKey,
  isEmpty,
  isSymbol,
  rbInspect,
  rbObjAsString,
  rbObjClassname,
  rbSetClassPathString,
  rtest,
  symbolToS,
} from "@blazetrails/ruby-compat";
import { deprecationWarning } from "../base.js";
import { Argument, type ArgumentOptions } from "./argument.js";

export interface OptionOptions extends ArgumentOptions {
  checkDefaultType?: boolean | null;
  repeatable?: unknown;
  lazyDefault?: unknown;
  group?: string | null;
  aliases?: string | string[] | null;
  hide?: unknown;
}

export class Option extends Argument {
  declare aliases: string[];
  declare group: string | null;
  declare lazyDefault: unknown;
  declare hide: unknown;
  declare repeatable: unknown;

  static override VALID_TYPES = ["boolean", "numeric", "hash", "array", "string"];

  declare private checkDefaultType: boolean | null;
  declare private _switchName: string | null;
  declare private _humanName: string | null;

  protected override initialize(name: string | null, options: OptionOptions = {}): void {
    this.checkDefaultType = options.checkDefaultType ?? null;
    if (!hasKey(options, "required")) options.required = false;
    this.repeatable = fetch(options, "repeatable", false);
    super.initialize(name, options);
    this.lazyDefault = options.lazyDefault ?? null;
    this.group = rtest(options.group) ? capitalize(rbObjAsString(options.group), []) : null;
    this.aliases = this.normalizeAliases(options.aliases);
    this.hide = options.hide ?? null;
  }

  static parse(key: string | string[], value: unknown): Option {
    let name: string;
    let aliases: string[];
    if (Array.isArray(key)) {
      [name, ...aliases] = key;
    } else {
      name = key;
      aliases = [];
    }

    name = rbObjAsString(name);
    let default_ = value;
    let required: boolean | null = null;

    let type: string | null = null;
    if (isSymbol(value)) {
      default_ = null;
      if (Option.VALID_TYPES.includes(symbolToS(value))) {
        type = symbolToS(value);
      } else if ((required = value === ":required")) {
        type = "string";
      }
    } else if (value === true || value === false) {
      type = "boolean";
    } else if (typeof value === "number" || typeof value === "bigint") {
      type = "numeric";
    } else if (
      rbObjClassname(value) === "Hash" ||
      Array.isArray(value) ||
      typeof value === "string"
    ) {
      type = rbObjClassname(value).toLowerCase();
    }

    return new this(rbObjAsString(name), { required, type, default: default_, aliases });
  }

  get switchName(): string {
    return (this._switchName ??= this.isDasherized() ? this.name : this.dasherize(this.name));
  }

  override get humanName(): string {
    return (this._humanName ??= this.isDasherized() ? this.undasherize(this.name) : this.name);
  }

  override usage(padding = 0): string {
    let sample: string;
    if (this.banner != null && !isEmpty(rbObjAsString(this.banner))) {
      sample = `${this.switchName}=${this.banner}`;
    } else {
      sample = this.switchName;
    }

    if (!rtest(this.isRequired())) sample = `[${sample}]`;

    if (
      this.isBoolean() &&
      this.name !== "force" &&
      !this.name.match(/^(no|skip)(?:[-_]|(?=[A-Z]))/)
    ) {
      sample += `, [${this.dasherize("no-" + this.humanName)}], [${this.dasherize("skip-" + this.humanName)}]`;
    }

    return this.aliasesForUsage().padEnd(padding) + sample;
  }

  aliasesForUsage(): string {
    if (isEmpty(this.aliases)) {
      return "";
    } else {
      return `${this.aliases.join(", ")}, `;
    }
  }

  override isShowDefault(): unknown {
    if (this.default === true || this.default === false) {
      return true;
    } else {
      return super.isShowDefault();
    }
  }

  isBoolean(): boolean {
    return this.type === "boolean";
  }

  isNumeric(): boolean {
    return this.type === "numeric";
  }

  isHash(): boolean {
    return this.type === "hash";
  }

  isArray(): boolean {
    return this.type === "array";
  }

  isString(): boolean {
    return this.type === "string";
  }

  /** @internal */
  protected override validateBang(): void {
    if (this.isBoolean() && rtest(this.isRequired())) {
      throw new ArgumentError("An option cannot be boolean and required.");
    }
    this.validateDefaultTypeBang();
  }

  /** @internal */
  protected validateDefaultTypeBang(): void {
    let defaultType: string | null = null;
    if (this.default == null) {
      return;
    } else if (this.default === true || this.default === false) {
      defaultType = rtest(this.isRequired()) ? "string" : "boolean";
    } else if (typeof this.default === "number" || typeof this.default === "bigint") {
      defaultType = "numeric";
    } else if (isSymbol(this.default)) {
      defaultType = "string";
    } else if (
      rbObjClassname(this.default) === "Hash" ||
      Array.isArray(this.default) ||
      typeof this.default === "string"
    ) {
      defaultType = rbObjClassname(this.default).toLowerCase();
    }

    const expectedType = rtest(this.repeatable) && this.type !== "hash" ? "array" : this.type;

    if (defaultType !== expectedType) {
      const err = `Expected ${expectedType} default value for '${this.switchName}'; got ${rbInspect(this.default)} (${defaultType ?? ""})`;

      if (rtest(this.checkDefaultType)) {
        throw new ArgumentError(err);
      } else if (this.checkDefaultType == null) {
        deprecationWarning(
          `${err}.\n` +
            "This will be rejected in the future unless you explicitly pass the options `check_default_type: false`" +
            " or call `allow_incompatible_default_type!` in your code",
        );
      }
    }
  }

  /** @internal */
  protected isDasherized(): boolean {
    return this.name.indexOf("-") === 0;
  }

  /** @internal */
  protected undasherize(str: string): string {
    return str.replace(/^-{1,2}/, "");
  }

  /** @internal */
  protected dasherize(str: string): string {
    return (
      (str.length > 1 ? "--" : "-") +
      str.replace(/(?<=[a-z\d])[A-Z]/g, (c) => `_${c.toLowerCase()}`).replaceAll("_", "-")
    );
  }

  /** @internal */
  private normalizeAliases(aliases: string | string[] | null | undefined): string[] {
    return (aliases == null ? [] : Array.isArray(aliases) ? aliases : [aliases]).map((short) =>
      rbObjAsString(short).replace(/^(?!-)/, "-"),
    );
  }
}
rbSetClassPathString(Option, { name: "Thor" }, "Option");
