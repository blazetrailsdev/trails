import {
  ArgumentError,
  hasKey,
  isEmpty,
  Range,
  rbModName,
  rbObjAsString,
  rbObjClass,
  rbObjRespondTo,
  rbSetClassPathString,
  rbStrDump,
  rtest,
} from "@blazetrails/ruby-compat";

export interface ArgumentOptions {
  type?: string | null;
  desc?: string | null;
  required?: unknown;
  default?: unknown;
  banner?: string | null;
  enum?: unknown;
  [key: string]: unknown;
}

export class Argument {
  static VALID_TYPES = ["numeric", "hash", "array", "string"];

  readonly name: string;
  readonly description: string | null;
  readonly enum: unknown;
  readonly required: unknown;
  readonly type: string;
  readonly default: unknown;
  readonly banner: string | null;

  get humanName(): string {
    return this.name;
  }

  constructor(name: string | null, options: ArgumentOptions = {}) {
    const className = rbModName(this.constructor as typeof Argument)!
      .split("::")
      .at(-1)!;

    const type = options.type;

    if (name == null) throw new ArgumentError(`${className} name can't be nil.`);
    if (type != null && !this.isValidType(type)) {
      throw new ArgumentError(`Type :${type} is not valid for ${className.toLowerCase()}s.`);
    }

    this.name = rbObjAsString(name);
    this.description = options.desc ?? null;
    this.required = hasKey(options, "required") ? options.required : true;
    this.type = type ?? "string";
    this.default = options.default ?? null;
    this.banner = options.banner ?? this.defaultBanner();
    this.enum = options.enum ?? null;

    this.validateBang();
  }

  printDefault(): unknown {
    if (this.type === "array" && Array.isArray(this.default)) {
      return this.default.map((s: string) => rbStrDump(s)).join(" ");
    } else {
      return this.default;
    }
  }

  usage(): string | null {
    return rtest(this.isRequired()) ? this.banner : `[${this.banner ?? ""}]`;
  }

  isRequired(): unknown {
    return this.required;
  }

  isShowDefault(): unknown {
    if (
      Array.isArray(this.default) ||
      typeof this.default === "string" ||
      rbObjClass(this.default) === "Hash"
    ) {
      return !isEmpty(this.default as object);
    } else {
      return this.default;
    }
  }

  enumToS(): string {
    if (rbObjRespondTo(this.enum, "join")) {
      return (this.enum as unknown[]).join(", ");
    } else {
      const range = this.enum as Range<unknown>;
      return `${range.first()}..${range.last()}`;
    }
  }

  /** @internal */
  protected validateBang(): void {
    if (rtest(this.isRequired()) && this.default != null) {
      throw new ArgumentError("An argument cannot be required and have default value.");
    }
    if (
      rtest(this.enum) &&
      !(
        Array.isArray(this.enum) ||
        this.enum instanceof Range ||
        this.enum instanceof Set ||
        rbObjClass(this.enum) === "Hash"
      )
    ) {
      throw new ArgumentError("An argument cannot have an enum other than an enumerable.");
    }
  }

  /** @internal */
  protected isValidType(type: string): boolean {
    return (this.constructor as typeof Argument).VALID_TYPES.includes(type);
  }

  /** @internal */
  protected defaultBanner(): string | null {
    switch (this.type) {
      case "boolean":
        return null;
      case "string":
      case "default":
        return this.humanName.toUpperCase();
      case "numeric":
        return "N";
      case "hash":
        return "key:value";
      case "array":
        return "one two three";
      default:
        return null;
    }
  }
}
rbSetClassPathString(Argument, { name: "Thor" }, "Argument");
