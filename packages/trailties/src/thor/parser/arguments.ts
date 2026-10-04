import {
  aryDelete,
  arySlice,
  first,
  format,
  Hash,
  isEmpty,
  isInclude,
  Range,
  rbFSend,
  rbInspect,
  rbModName,
  rbObjAsString,
  rbObjClassname,
  rbObjDup,
  rbObjRespondTo,
  rbSetClassPathString,
  rtest,
  stringSplit,
  toI,
} from "@blazetrails/ruby-compat";
import { MalformattedArgumentError, RequiredArgumentMissingError } from "../error.js";
import type { Argument } from "./argument.js";

export class Arguments {
  static NUMERIC = /[-+]?(\d*\.\d+|\d+)/;

  /** @internal */
  protected assigns: Record<string, unknown>;
  /** @internal */
  protected nonAssignedRequired: Argument[];
  /** @internal */
  protected switches: Argument[] | Record<string, Argument>;
  /** @internal */
  protected pile!: unknown[];

  static split(args: unknown[]): [unknown[], unknown[]] {
    const arguments_: unknown[] = [];

    for (const item of args) {
      if (typeof item === "string" && /^-/m.test(item)) break;
      arguments_.push(item);
    }

    return [arguments_, arySlice(args, new Range(arguments_.length, -1)) as unknown[]];
  }

  static parse(...args: unknown[]): Record<string, unknown> {
    const toParse = args.pop() as unknown[];
    return new this(...(args as [Argument[]?])).parse(toParse);
  }

  constructor(arguments_: Argument[] = []) {
    this.assigns = Object.create(null) as Record<string, unknown>;
    this.nonAssignedRequired = [];
    this.switches = arguments_;

    arguments_.forEach((argument) => {
      if (argument.default != null) {
        this.assigns[argument.humanName] = rbObjDup(argument.default);
      } else if (rtest(argument.isRequired())) {
        this.nonAssignedRequired.push(argument);
      }
    });
  }

  parse(args: unknown[]): Record<string, unknown> {
    this.pile = rbObjDup(args);

    for (const argument of this.switches as Argument[]) {
      if (!rtest(this.peek())) break;
      aryDelete(this.nonAssignedRequired, argument);
      this.assigns[argument.humanName] = rbFSend(
        this,
        `parse${argument.type.charAt(0).toUpperCase()}${argument.type.slice(1)}`,
        argument.humanName,
      );
    }

    this.checkRequirementBang();
    return this.assigns;
  }

  remaining(): unknown[] {
    return this.pile;
  }

  /** @internal */
  protected isNoOrSkip(arg: string): string | null {
    const match = /^--(no|skip)-([-\w]+)$/m.exec(arg);
    return match?.[2] ?? null;
  }

  /** @internal */
  protected isLast(): boolean {
    return isEmpty(this.pile);
  }

  /** @internal */
  protected peek(): unknown {
    return first(this.pile);
  }

  /** @internal */
  protected shift(): unknown {
    return this.pile.shift() ?? null;
  }

  /** @internal */
  protected unshift(arg: unknown): void {
    if (Array.isArray(arg)) {
      this.pile = arg.concat(this.pile);
    } else {
      this.pile.unshift(arg);
    }
  }

  /** @internal */
  protected isCurrentIsValue(): boolean {
    return rtest(this.peek()) && !/^-{1,2}\S+/m.test(rbObjAsString(this.peek()));
  }

  /** @internal */
  protected parseHash(name: string): unknown {
    if (rbObjClassname(this.peek()) === "Hash") return this.shift();
    const hash = Object.create(null) as Record<string, string>;

    while (this.isCurrentIsValue() && (this.peek() as string).includes(":")) {
      const [key, value] = stringSplit(this.shift() as string, ":", 2);
      if (isInclude(hash, key)) {
        throw new MalformattedArgumentError(
          `You can't specify '${key}' more than once in option '${name}'; got ${key}:${hash[key]} and ${key}:${value}`,
        );
      }
      hash[key] = value;
    }
    return hash;
  }

  /** @internal */
  protected parseArray(name: string): unknown {
    if (Array.isArray(this.peek())) return this.shift();

    const array: unknown[] = [];

    while (this.isCurrentIsValue()) {
      const value = this.shift() as string;

      if (!isEmpty(value)) {
        this.validateEnumValueBang(
          name,
          value,
          "Expected all values of '%s' to be one of %s; got %s",
        );
      }

      array.push(value);
    }
    return array;
  }

  /** @internal */
  protected parseNumeric(name: string): unknown {
    if (typeof this.peek() === "number" || typeof this.peek() === "bigint") return this.shift();

    const match =
      typeof this.peek() === "string" ? Arguments.NUMERIC.exec(this.peek() as string) : null;
    if (!(match && match[0] === this.peek())) {
      throw new MalformattedArgumentError(
        `Expected numeric value for '${name}'; got ${rbInspect(this.peek())}`,
      );
    }

    const value =
      match[0].indexOf(".") !== -1 ? parseFloat(this.shift() as string) : toI(this.shift());

    this.validateEnumValueBang(name, value, "Expected '%s' to be one of %s; got %s");

    return value;
  }

  /** @internal */
  protected parseString(name: string): unknown {
    if (this.isNoOrSkip(name) != null) {
      return null;
    } else {
      const value = this.shift();

      this.validateEnumValueBang(name, value, "Expected '%s' to be one of %s; got %s");

      return value;
    }
  }

  /** @internal */
  protected validateEnumValueBang(name: string, value: unknown, message: string): void {
    if (rbObjClassname(this.switches) !== "Hash") return;

    const switch_ = (this.switches as Record<string, Argument>)[name];

    if (switch_ == null) return;

    if (
      rtest(switch_.enum) &&
      !(Array.isArray(switch_.enum)
        ? switch_.enum.includes(value)
        : switch_.enum instanceof Set || switch_.enum instanceof Hash
          ? switch_.enum.has(value)
          : switch_.enum instanceof Range
            ? switch_.enum.isInclude(value)
            : isInclude(switch_.enum as object, value as PropertyKey))
    ) {
      throw new MalformattedArgumentError(format(message, name, switch_.enumToS(), value));
    }
  }

  /** @internal */
  protected checkRequirementBang(): void {
    if (isEmpty(this.nonAssignedRequired)) return;
    const names = this.nonAssignedRequired
      .map((o) => (rbObjRespondTo(o, "switchName") ? rbFSend(o, "switchName") : o.humanName))
      .join("', '");
    const className = rbModName(this.constructor as typeof Arguments)!
      .split("::")
      .at(-1)!
      .toLowerCase();
    throw new RequiredArgumentMissingError(
      `No value provided for required ${className} '${names}'`,
    );
  }
}
rbSetClassPathString(Arguments, { name: "Thor" }, "Arguments");
