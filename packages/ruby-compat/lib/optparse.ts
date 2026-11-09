import { File } from "./file.js";
import { argv as ARGV, env, rbProgname } from "./process-adapter.js";
import { RuntimeError } from "./runtime-error.js";
import { Shellwords } from "./shellwords.js";

type SwitchBlock = (value: unknown) => unknown;

/** `OptionParser::ParseError`, `vendor/ruby/v3.3.11/lib/optparse.rb:2122`. */
class ParseError extends RuntimeError {
  /** @noRailsEquivalent PERMANENT */
  static Reason = "parse error";
  /** @noRailsEquivalent PERMANENT */
  args: string[];

  /** @noRailsEquivalent PERMANENT */
  constructor(...args: string[]) {
    super("");
    this.args = args;
    this.message = this.buildMessage();
  }

  /** @noRailsEquivalent PERMANENT */
  setOption(opt: string, eq: unknown): this {
    if (eq) this.args[0] = opt;
    else this.args.unshift(opt);
    this.message = this.buildMessage();
    return this;
  }

  /** @noRailsEquivalent PERMANENT */
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

abstract class Switch {
  short: string[] = [];
  long: string[] = [];
  arg = "";
  desc: string[] = [];
  block: SwitchBlock | null = null;

  /** `Switch#add_banner`, `vendor/ruby/v3.3.11/lib/optparse.rb:640-646`. */
  addBanner(to: string): string {
    if (!(this.short.length > 0 || this.long.length > 0)) {
      const s = this.desc.join("");
      if (s !== "") to += " [" + s + "]...";
    }
    return to;
  }

  abstract parse(
    arg: string | null,
    argv: string[],
    error: (arg: string) => void,
  ): [string | null, unknown];
}

/** `Switch::NoArgument`, `vendor/ruby/v3.3.11/lib/optparse.rb:703`. */
class NoArgument extends Switch {
  parse(
    arg: string | null,
    _argv: string[],
    error: (arg: string) => void,
  ): [string | null, unknown] {
    if (arg != null) error(arg);
    return [arg, true];
  }
}

/** `Switch::RequiredArgument`, `vendor/ruby/v3.3.11/lib/optparse.rb:728`. */
class RequiredArgument extends Switch {
  parse(arg: string | null, argv: string[]): [string | null, unknown] {
    if (arg != null) return [null, arg];
    if (argv.length === 0) throw new MissingArgument();
    return [null, argv.shift()!];
  }
}

/** `Switch::OptionalArgument`, `vendor/ruby/v3.3.11/lib/optparse.rb:749`. */
class OptionalArgument extends Switch {
  parse(arg: string | null): [string | null, unknown] {
    return [null, arg];
  }
}

/** `Switch::PlacedArgument`, `vendor/ruby/v3.3.11/lib/optparse.rb:770`. */
class PlacedArgument extends Switch {
  parse(arg: string | null, argv: string[]): [string | null, unknown] {
    const val = arg ?? argv[0];
    if (arg == null && (val == null || /^-./.test(val))) return [null, null];
    if (arg == null) argv.shift();
    return [null, val];
  }
}

/** `OptionParser::List`, `vendor/ruby/v3.3.11/lib/optparse.rb:800`. */
class List {
  list: (Switch | string)[] = [];

  /** `List#add_banner`, `vendor/ruby/v3.3.11/lib/optparse.rb:961-967`. */
  addBanner(to: string): string {
    for (const opt of this.list) {
      if (opt instanceof Switch) {
        to = opt.addBanner(to);
      }
    }
    return to;
  }
}

/** `OptionParser::DefaultList`, `vendor/ruby/v3.3.11/lib/optparse.rb:1101`. */
const DefaultList = new List();

const stopOrder = Symbol("stopOrder");

/** @noRailsEquivalent PERMANENT — `OptionParser`, `vendor/ruby/v3.3.11/lib/optparse.rb:427`. */
export class OptionParser {
  /** @noRailsEquivalent PERMANENT */
  static ParseError = ParseError;
  /** @noRailsEquivalent PERMANENT */
  static AmbiguousOption = AmbiguousOption;
  /** @noRailsEquivalent PERMANENT */
  static NeedlessArgument = NeedlessArgument;
  /** @noRailsEquivalent PERMANENT */
  static MissingArgument = MissingArgument;
  /** @noRailsEquivalent PERMANENT */
  static InvalidOption = InvalidOption;

  private _programName: string | null = null;
  private _banner: string | null;
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/lib/optparse.rb:1147 */
  summaryWidth: number;
  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/lib/optparse.rb:1148 */
  summaryIndent: string;
  private _stack: List[] = [DefaultList, new List(), new List()];

  /** @noRailsEquivalent PERMANENT — vendor/ruby/v3.3.11/lib/optparse.rb:1143 */
  constructor(banner: string | null = null, width = 32, indent = " ".repeat(4)) {
    this._banner = banner;
    this.summaryWidth = width;
    this.summaryIndent = indent;
  }

  /** @noRailsEquivalent PERMANENT */
  get banner(): string {
    if (this._banner == null) {
      this._banner = `Usage: ${this.programName} [options]`;
      this._banner = this.visit("addBanner", this._banner);
    }
    return this._banner;
  }

  set banner(banner: string) {
    this._banner = banner;
  }

  /** @noRailsEquivalent PERMANENT — `OptionParser#top`, `vendor/ruby/v3.3.11/lib/optparse.rb:1297-1299`. */
  get top(): List {
    return this._stack.at(-1)!;
  }

  /** @noRailsEquivalent PERMANENT — `OptionParser#base`, `vendor/ruby/v3.3.11/lib/optparse.rb:1304-1306`. */
  get base(): List {
    return this._stack[1];
  }

  /** @noRailsEquivalent PERMANENT */
  get programName(): string {
    return this._programName ?? File.basename(rbProgname(), ".*");
  }

  set programName(programName: string) {
    this._programName = programName;
  }

  /** @noRailsEquivalent PERMANENT */
  separator(string: string): void {
    this.top.list.push(string);
  }

  /** @noRailsEquivalent PERMANENT */
  on(...opts: (string | SwitchBlock)[]): void {
    this.top.list.push(this._makeSwitch(opts));
  }

  /** @noRailsEquivalent PERMANENT — `on_tail`, `vendor/ruby/v3.3.11/lib/optparse.rb:1597`. */
  onTail(...opts: (string | SwitchBlock)[]): void {
    this.base.list.push(this._makeSwitch(opts));
  }

  private _makeSwitch(opts: (string | SwitchBlock)[]): Switch {
    const short: string[] = [];
    const long: string[] = [];
    const desc: string[] = [];
    let block: SwitchBlock | null = null;
    let arg = "";
    let klass: new () => Switch = NoArgument;
    const guess = (a: string | undefined): void => {
      if (a == null) return;
      arg = a;
      if (/^=\[/.test(a)) klass = OptionalArgument;
      else if (/^\s+\[/.test(a)) klass = PlacedArgument;
      else klass = RequiredArgument;
    };
    for (const o of opts) {
      let m: RegExpMatchArray | null;
      if (typeof o === "function") block = o;
      else if ((m = o.match(/^--([^[\]=\s]*)(.+)?/))) {
        long.push(m[1]);
        guess(m[2]);
      } else if ((m = o.match(/^-(.)(.+)?/))) {
        short.push(m[1]);
        guess(m[2]);
      } else if (o !== "") desc.push(o);
    }
    return Object.assign(new klass(), { short, long, desc, block, arg });
  }

  private get _switches(): Switch[] {
    return [...this._stack]
      .reverse()
      .flatMap((el) => el.list)
      .filter((l): l is Switch => l instanceof Switch);
  }

  private _complete(opt: string): Switch {
    const key = opt.toLowerCase();
    const found = new Set<Switch>();
    for (const sw of this._switches) {
      if (sw.long.some((l) => l.toLowerCase() === key)) return sw;
      if (sw.long.some((l) => l.toLowerCase().startsWith(key))) found.add(sw);
    }
    if (found.size > 1) throw new AmbiguousOption(opt);
    if (found.size === 0) throw new InvalidOption(opt);
    return [...found][0];
  }

  private _search(opt: string): Switch | undefined {
    return this._switches.find((sw) => sw.short.includes(opt));
  }

  private async _parseInOrder(argv: string[], nonopt: (arg: string) => void): Promise<string[]> {
    let arg: string | undefined;
    while ((arg = argv.shift()) !== undefined) {
      let m: RegExpMatchArray | null;
      if ((m = arg.match(/^--([^=]*)(?:=(.*))?/s))) {
        const opt = m[1].replace(/_/g, "-");
        const rest = m[2] ?? null;
        if (opt === "") break;
        let sw: Switch;
        try {
          sw = this._complete(opt);
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
        let sw = this._search(opt);
        try {
          sw ??= this._complete(opt);
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

  /** @noRailsEquivalent PERMANENT */
  async parse(argv: readonly string[] = ARGV): Promise<string[]> {
    const nonopts: string[] = [];
    const copy = [...argv];
    if (env.POSIXLY_CORRECT != null) {
      const stop = (arg: string): void => {
        copy.unshift(arg);
        throw stopOrder;
      };
      await this._parseInOrder(copy, stop).catch((e: unknown) => {
        if (e !== stopOrder) throw e;
      });
      return copy;
    }
    await this._parseInOrder(copy, (arg) => nonopts.push(arg));
    return [...nonopts, ...copy];
  }

  /** @noRailsEquivalent PERMANENT */
  async environment(name: string): Promise<void> {
    const value = env[name] ?? env[name.toUpperCase()];
    if (value == null || value === "") return;
    await this.parse(Shellwords.shellwords(value));
  }

  /**
   * `OptionParser#visit`, `vendor/ruby/v3.3.11/lib/optparse.rb:1830-1835`. A JS
   * string cannot be appended to in place (CLAUDE.md, "Ruby Strings are JS
   * string primitives"), so each `add_banner` result is threaded into the next
   * call and returned where Ruby mutates its argument and returns `nil`.
   *
   * @inventedArm return — PERMANENT
   * @noRailsEquivalent PERMANENT
   */
  visit(id: "addBanner", to: string): string {
    for (const el of [...this._stack].reverse()) {
      to = el[id](to);
    }
    return to;
  }

  /** @noRailsEquivalent PERMANENT */
  toString(): string {
    const out = [this.banner];
    for (const line of [...this._stack].reverse().flatMap((el) => el.list)) {
      if (!(line instanceof Switch)) {
        out.push(line);
        continue;
      }
      const names = [
        ...line.short.map((s) => `-${s}`),
        ...line.long.map((l, i) => `--${l}${i === 0 ? line.arg : ""}`),
      ];
      const left = names.join(", ");
      const desc = line.desc.join(" ");
      const indent = this.summaryIndent;
      const width = this.summaryWidth;
      if (left.length > width) out.push(`${indent}${left}`, `${indent}${"".padEnd(width)} ${desc}`);
      else out.push(`${indent}${left.padEnd(width)} ${desc}`);
    }
    return out.join("\n") + "\n";
  }
}
