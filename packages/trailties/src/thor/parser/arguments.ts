import {
  aryDelete,
  arySlice,
  first,
  format,
  Hash,
  isEmpty,
  isInclude,
  lastMatchGetter,
  matchOperator,
  Range,
  rbFSend,
  rbInspect,
  rbModName,
  rbObjAsString,
  rbObjClassname,
  rbObjDup,
  rbObjNotMatch,
  rbObjRespondTo,
  rbSetClassPathString,
  rbStrToF,
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
      if (typeof item === "string" && /(?<![^\n])-/.test(item)) break;
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
        `parse_${argument.type}`.replace(/_([a-zA-Z\d])/g, (_, c: string) => c.toUpperCase()),
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
    const match = /(?<![^\n])--(no|skip)-([-\w]+)(?![^\n])/.exec(arg);
    return match?.[2] ?? null;
  }

  /** @internal */
  protected isLast(): boolean {
    return isEmpty(this.pile);
  }

  /** @internal */
  protected peek(): unknown {
    return first(this.pile) ?? null;
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
  protected isCurrentIsValue(): unknown {
    return rtest(this.peek())
      ? rbObjNotMatch(rbObjAsString(this.peek()), /(?<![^\n])-{1,2}[^ \t\r\n\f\v]+/)
      : this.peek();
  }

  /** @internal */
  protected parseHash(name: string): unknown {
    if (rbObjClassname(this.peek()) === "Hash") return this.shift();
    const hash = Object.create(null) as Record<string, string>;

    while (rtest(this.isCurrentIsValue()) && (this.peek() as string).includes(":")) {
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

    while (rtest(this.isCurrentIsValue())) {
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

    if (
      !(rtest(matchOperator(this.peek(), Arguments.NUMERIC)) && lastMatchGetter() === this.peek())
    ) {
      throw new MalformattedArgumentError(
        `Expected numeric value for '${name}'; got ${rbInspect(this.peek())}`,
      );
    }

    const value =
      lastMatchGetter()!.indexOf(".") !== -1 ? rbStrToF(this.shift() as string) : toI(this.shift());

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
