import { ArgumentError } from "./argument-error.js";
import { File } from "./file.js";
import { stringValue } from "./string/support.js";

const SEPARATOR_PAT = /\//;
const ABSOLUTE_PATH = /^\//;

/** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/pathname.c:1511` `rb_cPathname` */
export class Pathname {
  private readonly path: string;

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/pathname.c:97` `path_initialize`, whose `RB_TYPE_P(arg, T_STRING)` arm and `StringValue` (`:100-107`) take a binary String too */
  constructor(arg: string | Uint8Array | { toPath(): string }) {
    const str = stringValue(
      typeof arg === "string" || arg instanceof Uint8Array ? arg : arg.toPath(),
    );
    if (str.includes("\0")) throw new ArgumentError("pathname contains null byte");
    this.path = str;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/pathname.c:139` `path_eq` */
  equals(other: unknown): boolean {
    if (!(other instanceof Pathname)) return false;
    return this.path === other.path;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/pathname.c:215` `path_to_s`, aliased `to_path` */
  toString(): string {
    return this.path;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/pathname.c:215` `path_to_s` */
  toPath(): string {
    return this.path;
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/lib/pathname.rb:50` */
  private chopBasename(path: string): [string, string] | null {
    const base = File.basename(path);
    if (/^\/?$/.test(base)) {
      return null;
    } else {
      return [path.slice(0, path.lastIndexOf(base)), base];
    }
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/lib/pathname.rb:233` */
  isAbsolute(): boolean {
    return ABSOLUTE_PATH.test(this.path);
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/lib/pathname.rb:356` `+` */
  plusOp(other: Pathname | string): Pathname {
    if (!(other instanceof Pathname)) other = new Pathname(other);
    return new Pathname(this.plus(this.path, other.toString()));
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/lib/pathname.rb:362` */
  private plus(path1: string, path2: string): string {
    let prefix2 = path2;
    const indexList2: number[] = [];
    const basenameList2: string[] = [];
    let r2: [string, string] | null;
    while ((r2 = this.chopBasename(prefix2))) {
      let basename2: string;
      [prefix2, basename2] = r2;
      indexList2.unshift(prefix2.length);
      basenameList2.unshift(basename2);
    }
    if (prefix2 !== "") return path2;
    let prefix1 = path1;
    for (;;) {
      while (basenameList2.length > 0 && basenameList2[0] === ".") {
        indexList2.shift();
        basenameList2.shift();
      }
      const r1 = this.chopBasename(prefix1);
      if (!r1) break;
      let basename1: string;
      [prefix1, basename1] = r1;
      if (basename1 === ".") continue;
      if (basename1 === ".." || basenameList2.length === 0 || basenameList2[0] !== "..") {
        prefix1 = prefix1 + basename1;
        break;
      }
      indexList2.shift();
      basenameList2.shift();
    }
    let r1: [string, string] | boolean | null = this.chopBasename(prefix1);
    if (!r1 && (r1 = SEPARATOR_PAT.test(File.basename(prefix1)))) {
      while (basenameList2.length > 0 && basenameList2[0] === "..") {
        indexList2.shift();
        basenameList2.shift();
      }
    }
    if (basenameList2.length > 0) {
      const suffix2 = path2.slice(indexList2[0]);
      return r1 ? File.join(prefix1, suffix2) : prefix1 + suffix2;
    } else {
      return r1 ? prefix1 : File.dirname(prefix1);
    }
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/lib/pathname.rb:416` */
  join(...args: (Pathname | string)[]): Pathname {
    if (args.length === 0) return this;
    const last = args.pop()!;
    let result = last instanceof Pathname ? last : new Pathname(last);
    if (result.isAbsolute()) return result;
    for (let arg of args.reverse()) {
      if (!(arg instanceof Pathname)) arg = new Pathname(arg);
      result = arg.plusOp(result);
      if (result.isAbsolute()) return result;
    }
    return this.plusOp(result);
  }
}
