import { ArgumentError } from "./argument-error.js";
import { File } from "./file.js";
import { rbInspect } from "./object.js";
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

  private chopBasename(path: string): [string, string] | null {
    const base = File.basename(path);
    if (/^\/?$/.test(base)) {
      return null;
    } else {
      return [path.slice(0, path.lastIndexOf(base)), base];
    }
  }

  private prependPrefix(prefix: string, relpath: string): string {
    if (relpath === "") {
      return File.dirname(prefix);
    } else if (SEPARATOR_PAT.test(prefix)) {
      prefix = File.dirname(prefix);
      if (File.basename(prefix + "a") !== "a") prefix = File.join(prefix, "");
      return prefix + relpath;
    } else {
      return prefix + relpath;
    }
  }

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/lib/pathname.rb:94` */
  cleanpath(considerSymlink = false): Pathname {
    if (considerSymlink) {
      return this.cleanpathConservative();
    } else {
      return this.cleanpathAggressive();
    }
  }

  private cleanpathAggressive(): Pathname {
    const path = this.path;
    const names: string[] = [];
    let pre = path;
    let r: [string, string] | null;
    while ((r = this.chopBasename(pre))) {
      let base: string;
      [pre, base] = r;
      switch (base) {
        case ".":
          break;
        case "..":
          names.unshift(base);
          break;
        default:
          if (names[0] === "..") {
            names.shift();
          } else {
            names.unshift(base);
          }
      }
    }
    if (SEPARATOR_PAT.test(File.basename(pre))) {
      while (names[0] === "..") names.shift();
    }
    return new Pathname(this.prependPrefix(pre, File.join(...names)));
  }

  private isHasTrailingSeparator(path: string): boolean {
    const r = this.chopBasename(path);
    if (r) {
      const [pre, basename] = r;
      return pre.length + basename.length < path.length;
    } else {
      return false;
    }
  }

  private addTrailingSeparator(path: string): string {
    if (File.basename(path + "a") === "a") {
      return path;
    } else {
      return File.join(path, "");
    }
  }

  private cleanpathConservative(): Pathname {
    const path = this.path;
    const names: string[] = [];
    let pre = path;
    let r: [string, string] | null;
    while ((r = this.chopBasename(pre))) {
      let base: string;
      [pre, base] = r;
      if (base !== ".") names.unshift(base);
    }
    if (SEPARATOR_PAT.test(File.basename(pre))) {
      while (names[0] === "..") names.shift();
    }
    if (names.length === 0) {
      return new Pathname(File.dirname(pre));
    } else {
      if (names.at(-1) !== ".." && File.basename(path) === ".") {
        names.push(".");
      }
      const result = this.prependPrefix(pre, File.join(...names));
      if (!/^(?:\.|\.\.)$/.test(names.at(-1)!) && this.isHasTrailingSeparator(path)) {
        return new Pathname(this.addTrailingSeparator(result));
      } else {
        return new Pathname(result);
      }
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

  /** @noRailsEquivalent PERMANENT — `vendor/ruby/v3.3.11/ext/pathname/lib/pathname.rb:517` */
  relativePathFrom(baseDirectory: Pathname | string): Pathname {
    if (!(baseDirectory instanceof Pathname)) baseDirectory = new Pathname(baseDirectory);
    const destDirectory = this.cleanpath().toString();
    baseDirectory = baseDirectory.cleanpath().toString();
    let destPrefix = destDirectory;
    const destNames: string[] = [];
    let r: [string, string] | null;
    while ((r = this.chopBasename(destPrefix))) {
      let basename: string;
      [destPrefix, basename] = r;
      if (basename !== ".") destNames.unshift(basename);
    }
    let basePrefix = baseDirectory;
    const baseNames: string[] = [];
    while ((r = this.chopBasename(basePrefix))) {
      let basename: string;
      [basePrefix, basename] = r;
      if (basename !== ".") baseNames.unshift(basename);
    }
    if (destPrefix !== basePrefix) {
      throw new ArgumentError(
        `different prefix: ${rbInspect(destPrefix)} and ${rbInspect(baseDirectory)}`,
      );
    }
    while (destNames.length > 0 && baseNames.length > 0 && destNames[0] === baseNames[0]) {
      destNames.shift();
      baseNames.shift();
    }
    if (baseNames.includes("..")) {
      throw new ArgumentError(`base_directory has ..: ${rbInspect(baseDirectory)}`);
    }
    baseNames.fill("..");
    const relpathNames = [...baseNames, ...destNames];
    if (relpathNames.length === 0) {
      return new Pathname(".");
    } else {
      return new Pathname(File.join(...relpathNames));
    }
  }
}
