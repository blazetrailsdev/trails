import { env } from "./process-adapter.js";
import { RuntimeError } from "./runtime-error.js";
import { Shellwords } from "./shellwords.js";

type SwitchBlock = (value: unknown) => unknown;
type Style = "none" | "required" | "optional" | "placed";

/** `OptionParser::ParseError`, `vendor/ruby/v3.3.11/lib/optparse.rb:2122`. */
class ParseError extends RuntimeError {
  static Reason = "parse error";
  args: string[];

  constructor(...args: string[]) {
    super("");
    this.args = args;
    this.message = this.buildMessage();
  }

  setOption(opt: string, eq: unknown): this {
    if (eq) this.args[0] = opt;
    else this.args.unshift(opt);
    this.message = this.buildMessage();
    return this;
  }

  get reason(): string {
    return (this.constructor as typeof ParseError).Reason;
  }

  private buildMessage(): string {
    return `${this.reason}: ${this.args.join(" ")}`;
  }
}

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/optparse.rb:2189`. */
class AmbiguousOption extends ParseError {
  static override Reason = "ambiguous option";
}
/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/optparse.rb:2196`. */
class NeedlessArgument extends ParseError {
  static override Reason = "needless argument";
}
/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/optparse.rb:2203`. */
class MissingArgument extends ParseError {
  static override Reason = "missing argument";
}
/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/lib/optparse.rb:2210`. */
class InvalidOption extends ParseError {
  static override Reason = "invalid option";
}

/**
 * `OptionParser::Switch` and its `NoArgument` / `RequiredArgument` /
 * `OptionalArgument` / `PlacedArgument` subclasses
 * (`vendor/ruby/v3.3.11/lib/optparse.rb:703-791`), one class over `style`.
 * Each `parse` answers `[rest of a short cluster, value]`.
 */
class Switch {
  short: string[] = [];
  long: string[] = [];
  style: Style = "none";
  arg = "";
  desc: string[] = [];
  block: SwitchBlock | null = null;

  parse(
    arg: string | null,
    argv: string[],
    error: (...exc: [string]) => void,
  ): [string | null, unknown] {
    switch (this.style) {
      case "none":
        if (arg != null) error(arg);
        return [arg, true];
      case "required":
        if (arg != null) return [null, arg];
        if (argv.length === 0) throw new MissingArgument();
        return [null, argv.shift()!];
      case "optional":
        return [null, arg];
      case "placed": {
        const val = arg ?? argv[0];
        if (arg == null && (val == null || /^-./.test(val))) return [null, null];
        if (arg == null) argv.shift();
        return [null, val];
      }
    }
  }
}

const stopOrder = Symbol("stopOrder");

/** @noRailsEquivalent PERMANENT — `OptionParser`, `vendor/ruby/v3.3.11/lib/optparse.rb:427`. */
export class OptionParser {
  static ParseError = ParseError;
  /** @noRailsEquivalent PERMANENT */
  static AmbiguousOption = AmbiguousOption;
  /** @noRailsEquivalent PERMANENT */
  static NeedlessArgument = NeedlessArgument;
  /** @noRailsEquivalent PERMANENT */
  static MissingArgument = MissingArgument;
  /** @noRailsEquivalent PERMANENT */
  static InvalidOption = InvalidOption;

  banner = "";
  private lines: (Switch | string)[] = [];
  private tail: Switch[] = [];

  separator(string: string): void {
    this.lines.push(string);
  }

  on(...opts: (string | SwitchBlock)[]): void {
    this.lines.push(this.makeSwitch(opts));
  }

  /** @noRailsEquivalent PERMANENT — `on_tail`, `vendor/ruby/v3.3.11/lib/optparse.rb:1597`. */
  onTail(...opts: (string | SwitchBlock)[]): void {
    this.tail.push(this.makeSwitch(opts));
  }

  private makeSwitch(opts: (string | SwitchBlock)[]): Switch {
    const sw = new Switch();
    const guess = (a: string | undefined): void => {
      if (a == null) return;
      sw.arg = a;
      if (/^=\[/.test(a)) sw.style = "optional";
      else if (/^\s+\[/.test(a)) sw.style = "placed";
      else sw.style = "required";
    };
    for (const o of opts) {
      let m: RegExpMatchArray | null;
      if (typeof o === "function") sw.block = o;
      else if ((m = o.match(/^--([^[\]=\s]*)(.+)?/))) {
        sw.long.push(m[1]);
        guess(m[2]);
      } else if ((m = o.match(/^-(.)(.+)?/))) {
        sw.short.push(m[1]);
        guess(m[2]);
      } else sw.desc.push(o);
    }
    return sw;
  }

  private get switches(): Switch[] {
    return [...this.lines, ...this.tail].filter((l): l is Switch => l instanceof Switch);
  }

  private complete(opt: string): Switch {
    const key = opt.toLowerCase();
    const found = new Set<Switch>();
    for (const sw of this.switches) {
      if (sw.long.some((l) => l.toLowerCase() === key)) return sw;
      if (sw.long.some((l) => l.toLowerCase().startsWith(key))) found.add(sw);
    }
    if (found.size > 1) throw new AmbiguousOption(opt);
    if (found.size === 0) throw new InvalidOption(opt);
    return [...found][0];
  }

  private search(opt: string): Switch | undefined {
    return this.switches.find((sw) => sw.short.includes(opt));
  }

  private async parseInOrder(argv: string[], nonopt: (arg: string) => void): Promise<string[]> {
    let arg: string | undefined;
    while ((arg = argv.shift()) !== undefined) {
      let m: RegExpMatchArray | null;
      if ((m = arg.match(/^--([^=]*)(?:=(.*))?/s))) {
        const opt = m[1].replace(/_/g, "-");
        const rest = m[2] ?? null;
        if (opt === "") break;
        let sw: Switch;
        try {
          sw = this.complete(opt);
        } catch (e) {
          if (e instanceof ParseError) throw e.setOption(arg, true);
          throw e;
        }
        try {
          const [, val] = sw.parse(rest, argv, (a) => {
            throw new NeedlessArgument(a);
          });
          await sw.block?.(val);
        } catch (e) {
          if (e instanceof ParseError) throw e.setOption(arg, rest);
          throw e;
        }
      } else if ((m = arg.match(/^-(.)((=).*|.+)?/s))) {
        const eq = m[3];
        const rest = m[2] ?? null;
        const opt = m[1];
        let sw = this.search(opt);
        try {
          sw ??= this.complete(opt);
        } catch (e) {
          if (e instanceof ParseError) throw e.setOption(arg, true);
          throw e;
        }
        let next: string | null;
        let val: unknown;
        try {
          [next, val] = sw.parse(rest, argv, (a) => {
            if (eq) throw new NeedlessArgument(a);
          });
        } catch (e) {
          if (e instanceof ParseError) throw e.setOption(arg, arg.length > 2);
          throw e;
        }
        if (next != null) {
          const short = next.replace(/^-*/, "-");
          if (short !== "-") argv.unshift(short);
        }
        await sw.block?.(val);
      } else nonopt(arg);
    }
    return argv;
  }

  async parse(argv: readonly string[]): Promise<string[]> {
    const nonopts: string[] = [];
    const copy = [...argv];
    if (env.POSIXLY_CORRECT != null) {
      const stop = (arg: string): void => {
        copy.unshift(arg);
        throw stopOrder;
      };
      await this.parseInOrder(copy, stop).catch((e: unknown) => {
        if (e !== stopOrder) throw e;
      });
      return copy;
    }
    await this.parseInOrder(copy, (arg) => nonopts.push(arg));
    return [...nonopts, ...copy];
  }

  async environment(name: string): Promise<void> {
    const value = env[name] ?? env[name.toUpperCase()];
    if (value == null || value === "") return;
    await this.parse(Shellwords.shellwords(value));
  }

  toString(): string {
    const out = [this.banner];
    for (const line of [...this.lines, ...this.tail]) {
      if (!(line instanceof Switch)) {
        out.push(line);
        continue;
      }
      const names = [
        ...line.short.map((s) => `-${s}`),
        ...line.long.map((l, i) => `--${l}${i === 0 ? line.arg : ""}`),
      ];
      out.push(`    ${names.join(", ").padEnd(32)} ${line.desc.join(" ")}`);
    }
    return out.join("\n") + "\n";
  }
}
