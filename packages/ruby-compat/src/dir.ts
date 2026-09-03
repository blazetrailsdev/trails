import { File } from "./file.js";
import { getFs } from "./fs-adapter.js";

const MAGIC = /[*?[{]/;

function braceExpand(pattern: string): string[] {
  const open = pattern.indexOf("{");
  if (open === -1) return [pattern];
  let depth = 0;
  let close = -1;
  const alternatives: string[] = [];
  let start = open + 1;
  for (let i = open; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        alternatives.push(pattern.slice(start, i));
        close = i;
        break;
      }
    } else if (char === "," && depth === 1) {
      alternatives.push(pattern.slice(start, i));
      start = i + 1;
    }
  }
  if (close === -1) return [pattern];
  const prefix = pattern.slice(0, open);
  const suffix = pattern.slice(close + 1);
  return alternatives.flatMap((alternative) => braceExpand(`${prefix}${alternative}${suffix}`));
}

function fnmatch(segment: string, name: string): boolean {
  let source = "";
  for (let i = 0; i < segment.length; i++) {
    const char = segment[i];
    if (char === "\\" && i + 1 < segment.length) {
      source += segment[++i].replace(/[.*+?^${}()|[\]\\]/, "\\$&");
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else if (char === "[") {
      const close = segment.indexOf("]", i + 1);
      if (close === -1) {
        source += "\\[";
      } else {
        const body = segment.slice(i + 1, close).replace(/^!/, "^");
        source += `[${body}]`;
        i = close;
      }
    } else source += char.replace(/[.*+?^${}()|[\]\\]/, "\\$&");
  }
  if (!new RegExp(`^${source}$`).test(name)) return false;
  return !name.startsWith(".") || segment.startsWith(".");
}

function children(dirname: string): string[] {
  try {
    return getFs().readdirSync(dirname).sort();
  } catch {
    return [];
  }
}

/**
 * `vendor/ruby/dir.c:329` — a backslash escapes the character after it, so
 * `Dir.glob("a\\,b/*")` walks the single directory named `a,b`.
 */
function unescape(segment: string): string {
  return segment.replace(/\\(.)/g, "$1");
}

function segmentMatches(segment: string, name: string): boolean {
  return MAGIC.test(segment) ? fnmatch(segment, name) : unescape(segment) === name;
}

function globHelper(base: string, segments: string[], found: string[], enumerated: boolean): void {
  const [segment, ...rest] = segments;
  if (segment === undefined) {
    if (enumerated || File.isExist(base)) found.push(base);
    return;
  }
  const join = (name: string): string =>
    base.endsWith(File.SEPARATOR) ? `${base}${name}` : `${base}${File.SEPARATOR}${name}`;
  if (segment === "**" && rest.length > 0) {
    for (const name of children(base)) {
      if (name.startsWith(".")) continue;
      if (segmentMatches(rest[0], name)) globHelper(join(name), rest.slice(1), found, true);
      if (File.isDirectory(join(name))) globHelper(join(name), segments, found, true);
    }
    return;
  }
  if (!MAGIC.test(segment)) {
    globHelper(join(unescape(segment)), rest, found, false);
    return;
  }
  for (const name of children(base)) {
    if (!fnmatch(segment === "**" ? "*" : segment, name)) continue;
    globHelper(join(name), rest, found, true);
  }
}

/**
 * `Dir` (`vendor/ruby/dir.c:3632` `rb_cDir`), the sliver of it trails calls.
 *
 * Rails reaches directories through this class — `Dir.children(cache_path)` in
 * `vendor/rails/activesupport/lib/active_support/cache/file_store.rb:34`,
 * `Dir.delete(dir)` at `file_store.rb:198`, `Dir.each_child(dir)` at
 * `file_store.rb:210` — so trails reaches them through a class of the same
 * name. The backend is the `FsAdapter` contract in `./fs-adapter.js`.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Dir` (`vendor/ruby/dir.c:3632`),
 * which Rails calls without defining, so no Rails or gem file declares the
 * class this file's single export lives in.
 */
export class Dir {
  /**
   * `vendor/ruby/dir.c:1413` `dir_s_getwd`, registered under both `getwd` and
   * `pwd` (`dir.c:3661-3662`) — the path to the current working directory.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.pwd`
   * (`vendor/ruby/dir.c:1413`).
   */
  static pwd(): string {
    return getFs().cwd();
  }

  /**
   * `vendor/ruby/dir.c:3421` `dir_s_children`: every entry EXCEPT `"."` and
   * `".."`, and it raises rather than answering `[]` when the directory is
   * missing.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.children`
   * (`vendor/ruby/dir.c:3421`).
   */
  static children(dirname: string): string[] {
    return getFs().readdirSync(dirname);
  }

  /**
   * `vendor/ruby/dir.c:3288` `dir_foreach`, which yields `"."` and `".."`
   * ahead of the entries `Dir.children` answers — the two `dir_each` reads
   * out of the directory stream and `dir_each_entry` filters only for
   * `each_child` — and raises rather than yielding nothing when the directory
   * is missing.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.foreach`
   * (`vendor/ruby/dir.c:3288`).
   */
  static foreach(dirname: string, block: (filename: string) => void): null {
    const children = Dir.children(dirname);
    for (const filename of [".", "..", ...children]) block(filename);
    return null;
  }

  /**
   * `vendor/ruby/dir.c:3347` `dir_s_each_child`, which yields each of
   * `Dir.children`'s names.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.each_child`
   * (`vendor/ruby/dir.c:3347`).
   */
  static eachChild(dirname: string, block: (filename: string) => void): void {
    for (const filename of Dir.children(dirname)) block(filename);
  }

  /**
   * `vendor/ruby/dir.c:1535` `dir_s_rmdir`, which answers `0` and removes only
   * an EMPTY directory.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.delete`
   * (`vendor/ruby/dir.c:1535`).
   */
  static delete(dirname: string): number {
    getFs().rmdirSync(dirname);
    return 0;
  }

  /**
   * `vendor/ruby/dir.c:3227` `dir_s_glob`. Three things node's globbers get
   * wrong. `**` matching ZERO directories is tried on each entry before that
   * entry is descended into, so the two depths interleave rather than a
   * directory's own matches all preceding its children's —
   * `Dir.glob("g/**\/*.rb")` answers `g/B.rb`, `g/a/x.rb`, `g/a.rb` in that
   * order. A leading dot is matched only by a literal dot (`dir.c:325`).
   * And entries come out of each directory sorted, which is `sort: true`, the
   * default since Ruby 3.0 (`dir.c:3210`).
   *
   * A broken symlink is answered, because it is a directory entry
   * (`dir.c:3421`) rather than something `File.exist?` is asked about — which
   * is what the `enumerated` argument below carries: a path reached purely
   * through literal segments has never been proved to exist, so it is the one
   * that still needs the stat.
   *
   * @noRailsEquivalent PERMANENT — Ruby core `Dir.glob`
   * (`vendor/ruby/dir.c:3227`).
   */
  static glob(pattern: string): string[] {
    const found: string[] = [];
    for (const expanded of braceExpand(pattern)) {
      const absolute = expanded.startsWith(File.SEPARATOR);
      const segments = expanded.split(File.SEPARATOR);
      if (absolute) segments.shift();
      globHelper(absolute ? File.SEPARATOR : ".", segments, found, false);
    }
    if (pattern.startsWith(".")) return found;
    return found.map((entry) => (entry.startsWith("./") ? entry.slice(2) : entry));
  }
}
