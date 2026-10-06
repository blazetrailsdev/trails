import {
  aryDelete,
  compact,
  eachPair,
  hasKey,
  isEmpty,
  keys,
  matchOperator,
  mergeBang,
  rbFSend,
  rbInspect,
  rbModName,
  rbObjAsString,
  rbObjClassname,
  rbObjDup,
  rbObjNotMatch,
  rbObjRespondTo,
  rbSetClassPathString,
  rtest,
} from "@blazetrails/ruby-compat";
import {
  HashWithIndifferentAccess,
  type ThorOptions,
} from "../core-ext/hash-with-indifferent-access.js";
import {
  AtLeastOneRequiredArgumentError,
  ExclusiveArgumentError,
  MalformattedArgumentError,
  UnknownArgumentError,
} from "../error.js";
import { Arguments } from "./arguments.js";
import type { Option } from "./option.js";

export class Options extends Arguments {
  static LONG_RE = /(?<![^\n])(--\w+(?:-\w+)*)(?![^\n])/;
  static SHORT_RE = /(?<![^\n])(-[a-z])(?![^\n])/i;
  static EQ_RE = /(?<![^\n])(--\w+(?:-\w+)*|-[a-z])=([^\n]*)(?![^\n])/i;
  static SHORT_SQ_RE = /(?<![^\n])-([a-z]{2,})(?![^\n])/i;
  static SHORT_NUM = new RegExp(`(?<![^\\n])(-[a-z])${Arguments.NUMERIC.source}(?![^\\n])`, "i");
  static OPTS_END = "--";

  /** @internal */
  declare protected switches: Record<string, Option>;
  /** @internal */
  protected stopOnUnknown: unknown;
  /** @internal */
  protected exclusives: string[][];
  /** @internal */
  protected atLeastOnes: string[][];
  /** @internal */
  protected disableRequiredCheck: unknown;
  /** @internal */
  protected shorts: Record<string, string>;
  /** @internal */
  protected extra: unknown[];
  /** @internal */
  protected stoppedParsingAfterExtraIndex: number | null;
  /** @internal */
  protected isTreatedAsValue: boolean;
  /** @internal */
  protected parsingOptions: boolean | null = null;

  static toSwitches(options: Record<string, unknown>): string {
    return compact(
      Object.entries(options).map(([key, value]) => {
        if (value === true) {
          return `--${key}`;
        } else if (Array.isArray(value)) {
          return `--${key} ${value.map((v) => rbInspect(v)).join(" ")}`;
        } else if (rbObjClassname(value) === "Hash") {
          return `--${key} ${Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => `${k}:${rbObjAsString(v)}`)
            .join(" ")}`;
        } else if (value == null || value === false) {
          return null;
        } else {
          return `--${key} ${rbInspect(value)}`;
        }
      }),
    ).join(" ");
  }

  constructor(
    hashOptions: Record<string, Option> = {},
    defaults: Record<string, unknown> = {},
    stopOnUnknown: unknown = false,
    disableRequiredCheck: unknown = false,
    relations: { exclusiveOptionNames?: string[][]; atLeastOneOptionNames?: string[][] } = {},
  ) {
    const options = Object.values(hashOptions);
    super(options);
    this.stopOnUnknown = stopOnUnknown;
    this.exclusives = (relations.exclusiveOptionNames ?? []).filter((array) => !isEmpty(array));
    this.atLeastOnes = (relations.atLeastOneOptionNames ?? []).filter((array) => !isEmpty(array));
    this.disableRequiredCheck = disableRequiredCheck;

    eachPair(defaults, (key, value) => {
      this.assigns[rbObjAsString(key)] = value;
      aryDelete(this.nonAssignedRequired, hashOptions[key]);
    });

    this.shorts = Object.create(null) as Record<string, string>;
    this.switches = Object.create(null) as Record<string, Option>;
    this.extra = [];
    this.stoppedParsingAfterExtraIndex = null;
    this.isTreatedAsValue = false;

    options.forEach((option) => {
      this.switches[option.switchName] = option;

      option.aliases.forEach((name) => {
        this.shorts[name] ??= option.switchName;
      });
    });
  }

  override remaining(): unknown[] {
    return this.extra;
  }

  override peek(): unknown {
    if (!rtest(this.parsingOptions)) return super.peek();

    const result = super.peek();
    if (result === Options.OPTS_END) {
      this.shift();
      this.parsingOptions = false;
      this.stoppedParsingAfterExtraIndex ??= this.extra.length;
      return super.peek();
    } else {
      return result;
    }
  }

  override shift(): unknown {
    this.isTreatedAsValue = false;
    return super.shift();
  }

  override unshift(arg: unknown, { isValue = false }: { isValue?: boolean } = {}): void {
    this.isTreatedAsValue = isValue;
    super.unshift(arg);
  }

  override parse(args: unknown[]): ThorOptions<Record<string, unknown>> {
    this.pile = rbObjDup(args);
    this.isTreatedAsValue = false;
    this.parsingOptions = true;

    while (rtest(this.peek())) {
      if (this.isParsingOptions()) {
        const [match, isSwitch] = this.isCurrentIsSwitch();
        const shifted = this.shift();

        if (isSwitch) {
          let switch_: string | undefined;
          let md: RegExpExecArray | null;
          if ((md = Options.SHORT_SQ_RE.exec(shifted as string))) {
            this.unshift(md[1].split("").map((f) => `-${f}`));
            continue;
          } else if ((md = Options.EQ_RE.exec(shifted as string))) {
            this.unshift(md[2], { isValue: true });
            switch_ = md[1];
          } else if ((md = Options.SHORT_NUM.exec(shifted as string))) {
            this.unshift(md[2]);
            switch_ = md[1];
          } else if (
            (md =
              Options.LONG_RE.exec(shifted as string) ?? Options.SHORT_RE.exec(shifted as string))
          ) {
            switch_ = md[1];
          }

          switch_ = this.normalizeSwitch(switch_!);
          const option = this.switchOption(switch_)!;
          const result = this.parsePeek(switch_, option);
          this.assignResultBang(option, result);
        } else if (rtest(this.stopOnUnknown)) {
          this.parsingOptions = false;
          this.extra.push(shifted);
          this.stoppedParsingAfterExtraIndex ??= this.extra.length;
          while (rtest(this.peek())) this.extra.push(this.shift());
          break;
        } else if (match) {
          this.extra.push(shifted);
          while (rtest(this.peek()) && rbObjNotMatch(this.peek(), /(?<![^\n])-/)) {
            this.extra.push(this.shift());
          }
        } else {
          this.extra.push(shifted);
        }
      } else {
        this.extra.push(this.shift());
      }
    }

    if (!rtest(this.disableRequiredCheck)) this.checkRequirementBang();
    this.checkExclusiveBang();
    this.checkAtLeastOneBang();

    const assigns = new HashWithIndifferentAccess(this.assigns) as ThorOptions<
      Record<string, unknown>
    >;
    assigns.freeze();
    return assigns;
  }

  checkExclusiveBang(): void {
    const opts = keys(this.assigns);
    const found = this.exclusives.find(
      (ex) => ex.filter((o) => !opts.includes(o)).length < ex.length - 1,
    );
    if (found) {
      const names = this.namesToSwitchNames([
        ...new Set(found.filter((o) => opts.includes(o))),
      ]).map((n) => `'${n}'`);
      const className = rbModName(this.constructor as typeof Options)!
        .split("::")
        .at(-1)!
        .toLowerCase();
      throw new ExclusiveArgumentError(`Found exclusive ${className} ${names.join(", ")}`);
    }
  }

  checkAtLeastOneBang(): void {
    const opts = keys(this.assigns);
    const found = this.atLeastOnes.find((oneReqs) => !oneReqs.some((o) => opts.includes(o)));
    if (found) {
      const names = this.namesToSwitchNames(found).map((n) => `'${n}'`);
      const className = rbModName(this.constructor as typeof Options)!
        .split("::")
        .at(-1)!
        .toLowerCase();
      throw new AtLeastOneRequiredArgumentError(
        `Not found at least one of required ${className} ${names.join(", ")}`,
      );
    }
  }

  checkUnknownBang(): void {
    const toCheck =
      this.stoppedParsingAfterExtraIndex != null
        ? this.extra.slice(0, this.stoppedParsingAfterExtraIndex)
        : this.extra;

    const unknown = toCheck.filter((str) =>
      rtest(matchOperator(str, /(?<![^\n])--?(?:(?!--)[^\n])*(?![^\n])/)),
    );
    if (!isEmpty(unknown)) throw new UnknownArgumentError(keys(this.switches), unknown as string[]);
  }

  /** @internal */
  protected namesToSwitchNames(names: string[] = []): string[] {
    return compact(
      Object.values(this.switches).map((o) => {
        if (names.includes(o.name)) {
          return rbObjRespondTo(o, "switchName")
            ? (rbFSend(o, "switchName") as string)
            : o.humanName;
        } else {
          return null;
        }
      }),
    );
  }

  /** @internal */
  protected assignResultBang(option: Option, result: unknown): void {
    if (rtest(option.repeatable) && option.type === "hash") {
      mergeBang(
        (this.assigns[option.humanName] ??= Object.create(null)) as Record<string, unknown>,
        result as Record<string, unknown>,
      );
    } else if (rtest(option.repeatable)) {
      ((this.assigns[option.humanName] ??= []) as unknown[]).push(result);
    } else {
      this.assigns[option.humanName] = result;
    }
  }

  /** @internal */
  protected isCurrentIsSwitch(): [boolean, boolean] {
    if (this.isTreatedAsValue) return [false, false];
    const peek = this.peek();
    let md: RegExpExecArray | null;
    if (typeof peek !== "string") {
      return [false, false];
    } else if (
      (md =
        Options.LONG_RE.exec(peek) ??
        Options.SHORT_RE.exec(peek) ??
        Options.EQ_RE.exec(peek) ??
        Options.SHORT_NUM.exec(peek))
    ) {
      return [true, this.isSwitch(md[1])];
    } else if ((md = Options.SHORT_SQ_RE.exec(peek))) {
      return [true, md[1].split("").some((f) => this.isSwitch(`-${f}`))];
    } else {
      return [false, false];
    }
  }

  /** @internal */
  protected isCurrentIsSwitchFormatted(): boolean {
    if (this.isTreatedAsValue) return false;
    const peek = this.peek();
    if (
      typeof peek === "string" &&
      (Options.LONG_RE.test(peek) ||
        Options.SHORT_RE.test(peek) ||
        Options.EQ_RE.test(peek) ||
        Options.SHORT_NUM.test(peek) ||
        Options.SHORT_SQ_RE.test(peek))
    ) {
      return true;
    } else {
      return false;
    }
  }

  /** @internal */
  protected override isCurrentIsValue(): unknown {
    if (this.isTreatedAsValue) return true;
    return rtest(this.peek()) ? !this.isParsingOptions() || super.isCurrentIsValue() : this.peek();
  }

  /** @internal */
  protected isSwitch(arg: string): boolean {
    return this.switchOption(this.normalizeSwitch(arg)) != null;
  }

  /** @internal */
  protected switchOption(arg: string): Option | null {
    const match = this.isNoOrSkip(arg);
    if (match != null) {
      return this.switches[arg] ?? this.switches[`--${match}`] ?? null;
    } else {
      return this.switches[arg] ?? null;
    }
  }

  /** @internal */
  protected normalizeSwitch(arg: string): string {
    return (this.shorts[arg] ?? arg).replaceAll("_", "-");
  }

  /** @internal */
  protected isParsingOptions(): boolean | null {
    this.peek();
    return this.parsingOptions;
  }

  /** @internal */
  protected parseBoolean(switch_: string): boolean {
    if (rtest(this.isCurrentIsValue())) {
      if (["true", "TRUE", "t", "T", true].includes(this.peek() as string)) {
        this.shift();
        return true;
      } else if (["false", "FALSE", "f", "F", false].includes(this.peek() as string)) {
        this.shift();
        return false;
      } else {
        return hasKey(this.switches, switch_) || this.isNoOrSkip(switch_) == null;
      }
    } else {
      return hasKey(this.switches, switch_) || this.isNoOrSkip(switch_) == null;
    }
  }

  /** @internal */
  protected parsePeek(switch_: string, option: Option): unknown {
    if (rtest(this.isParsingOptions()) && (this.isCurrentIsSwitchFormatted() || this.isLast())) {
      // eslint-disable-next-line no-empty
      if (option.isBoolean()) {
      } else if (this.isNoOrSkip(switch_) != null) {
        return null;
      } else if (option.isString() && !rtest(option.isRequired())) {
        return rtest(option.lazyDefault)
          ? option.lazyDefault
          : rtest(option.default)
            ? option.default
            : option.humanName;
      } else if (rtest(option.lazyDefault)) {
        return option.lazyDefault;
      } else {
        throw new MalformattedArgumentError(`No value provided for option '${switch_}'`);
      }
    }

    aryDelete(this.nonAssignedRequired, option);
    return rbFSend(
      this,
      `parse${option.type.charAt(0).toUpperCase()}${option.type.slice(1)}`,
      switch_,
    );
  }
}
rbSetClassPathString(Options, { name: "Thor" }, "Options");
