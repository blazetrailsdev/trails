import { ArgumentError, File, chomp, rbStrSub, stringSplit } from "@blazetrails/ruby-compat";

type PathmapBlock = (match: string) => string;

export function ext(self: string, newext = ""): string {
  if ([".", ".."].includes(self)) return self;
  if (newext !== "") {
    if (!/^\./m.test(newext)) newext = "." + newext;
  }
  return chomp(self, File.extname(self)) + newext;
}

function pathmapExplode(self: string): string[] {
  const [head, tail] = File.split(self);
  if (head === self) return [self];
  if (head === "." || tail === "/") return [tail];
  if (head === "/") return [head, tail];
  return [...pathmapExplode(head), tail];
}

/** @missingRailsArgs pathmap_explode — PERMANENT */
function pathmapPartial(self: string, n: number): string {
  const dirs = pathmapExplode(File.dirname(self));
  let partialDirs: string | string[];
  if (n > 0) {
    partialDirs = dirs.slice(0, n);
  } else if (n < 0) {
    partialDirs = [...dirs].reverse().slice(0, -n).reverse();
  } else {
    partialDirs = ".";
  }
  return File.join(...[partialDirs].flat());
}

function pathmapReplace(self: string, patterns: string, block?: PathmapBlock): string {
  let result = self;
  for (const pair of stringSplit(patterns, ";")) {
    const [source, replacement] = stringSplit(pair, ",");
    let pattern: string | RegExp = source;
    pattern = new RegExp(pattern, "m");
    if (replacement === "*" && block) {
      result = result.replace(pattern, (match) => block(match));
    } else if (replacement) {
      result = rbStrSub({ string: result }, pattern, replacement);
    } else {
      result = rbStrSub({ string: result }, pattern, "");
    }
  }
  return result;
}

/** @missingRailsArgs ext — PERMANENT */
export function pathmap(self: string, spec: string | null = null, block?: PathmapBlock): string {
  if (spec == null) return self;
  let result = "";
  for (const [frag] of spec.matchAll(/%\{[^}]*\}-?\d*[sdpfnxX%]|%-?\d+d|%.|[^%]+/g)) {
    let m: RegExpMatchArray | null;
    if (frag === "%f") {
      result += File.basename(self);
    } else if (frag === "%n") {
      result += ext(File.basename(self));
    } else if (frag === "%d") {
      result += File.dirname(self);
    } else if (frag === "%x") {
      result += File.extname(self);
    } else if (frag === "%X") {
      result += ext(self);
    } else if (frag === "%p") {
      result += self;
    } else if (frag === "%s") {
      result += File.ALT_SEPARATOR || File.SEPARATOR;
    } else if (frag === "%-") {
      continue;
    } else if (frag === "%%") {
      result += "%";
    } else if ((m = frag.match(/%(-?\d+)d/))) {
      result += pathmapPartial(self, Number(m[1]));
    } else if ((m = frag.match(/^%\{([^}]*)\}(\d*[dpfnxX])/m))) {
      const [, patterns, operator] = m;
      result += pathmapReplace(pathmap(self, "%" + operator), patterns, block);
    } else if (/^%/m.test(frag)) {
      throw new ArgumentError(`Unknown pathmap specifier ${frag} in '${spec}'`);
    } else {
      result += frag;
    }
  }
  return result;
}
