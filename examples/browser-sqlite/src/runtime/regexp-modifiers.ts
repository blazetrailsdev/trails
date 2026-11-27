const ESCAPE =
  /^\\(?:[pPk][{<][^}>]*[}>]|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|c[A-Za-z]|.)/su;
const CODE_ESCAPE = /^\\(?:x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|u\{([0-9a-fA-F]+)\})$/;
const GROUP_OPEN = /^\((?:\?(?:<[A-Za-z_$][\w$]*>|<?[=!:]))?/;
const MODIFIER_OPEN = /^\(\?([ims]*)(?:-([ims]+))?:/;
const QUANTIFIER = /^\{\d+(?:,\d*)?\}/;

function otherCase(c: string): string | null {
  const u = c.toUpperCase();
  const l = c.toLowerCase();
  if (u === l || u.length !== 1 || l.length !== 1) return null;
  return c === u ? l : u;
}

function escapedOtherCase(escape: string): string | null {
  const m = CODE_ESCAPE.exec(escape);
  if (!m) return null;
  return otherCase(String.fromCodePoint(parseInt(m[1] ?? m[2] ?? m[3], 16)));
}

function groupEnd(source: string, start: number): number {
  let depth = 0;
  let inClass = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") i++;
    else if (inClass) inClass = c !== "]";
    else if (c === "[") inClass = true;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return i + 1;
  }
  return source.length;
}

function rewrite(source: string, fold: boolean, dotAll: boolean): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const rest = source.slice(i);
    if (c === "\\") {
      const escape = ESCAPE.exec(rest)![0];
      i += escape.length - 1;
      const other = fold ? escapedOtherCase(escape) : null;
      if (other === null) out += escape;
      else out += inClass ? `${escape}${other}` : `[${escape}${other}]`;
    } else if (inClass) {
      out += c;
      if (c === "]") {
        inClass = false;
      } else if (fold) {
        const end = source[i + 2];
        if (source[i + 1] === "-" && end !== undefined && end !== "]" && end !== "\\") {
          out += `-${end}`;
          i += 2;
          const a = otherCase(c);
          const b = otherCase(end);
          if (a !== null && b !== null && /^(?:[a-z]{2}|[A-Z]{2})$/.test(c + end)) {
            out += `${a}-${b}`;
          }
        } else {
          out += otherCase(c) ?? "";
        }
      }
    } else if (c === "[") {
      inClass = true;
      out += c;
      if (source[i + 1] === "^") out += source[++i];
      if (source[i + 1] === "]") out += source[++i];
    } else if (c === "(") {
      const modifier = MODIFIER_OPEN.exec(rest);
      if (modifier && modifier[0] !== "(?:") {
        const [open, on = "", off = ""] = modifier;
        const end = groupEnd(source, i);
        const inner = source.slice(i + open.length, end - 1);
        const innerFold = off.includes("i") ? false : fold || on.includes("i");
        const innerDotAll = off.includes("s") ? false : dotAll || on.includes("s");
        out += `(?:${rewrite(inner, innerFold, innerDotAll)})`;
        i = end - 1;
      } else {
        const group = GROUP_OPEN.exec(rest)![0];
        out += group;
        i += group.length - 1;
      }
    } else if (c === "{" && QUANTIFIER.test(rest)) {
      const quantifier = QUANTIFIER.exec(rest)![0];
      out += quantifier;
      i += quantifier.length - 1;
    } else if (dotAll && c === ".") {
      out += "[^]";
    } else {
      const other = fold ? otherCase(c) : null;
      out += other === null ? c : `[${c}${other}]`;
    }
  }
  return out;
}

/**
 * Rewrites each modifier group in `source` (`(?i-ms:…)`) into a plain `(?:…)`
 * group, writing into its source the `i` and `s` in effect there: the
 * enclosing groups' set, plus what the group turns on, less what it turns off.
 * Under `i` a cased letter, including a `\xHH`, `\uHHHH` or `\u{…}` escape of
 * one, becomes a class of both cases, and a range of ASCII letters gains its
 * other-case range; under `s` a `.` outside a class becomes `[^]`.
 *
 * Not reproduced: a group that turns off a flag the whole pattern carries (the
 * pattern's own flags still apply inside it), `m`, a backreference's
 * case-insensitive match, a property escape such as `\p{Lu}`, and a range
 * outside ASCII letters, each of which keeps its case-sensitive meaning.
 */
export function rewriteModifiers(source: string): string {
  return rewrite(source, false, false);
}

function hasModifiers(): boolean {
  try {
    new RegExp("(?i-ms:a)");
    return true;
  } catch {
    return false;
  }
}

/**
 * Regex modifier groups, `(?i-ms:…)`, are ES2025. ruby-compat's `rbRegToS`
 * (Ruby's `Regexp#to_s`) writes them, and ActiveRecord's `READ_QUERY` and the
 * router build patterns from it, so on Safari before 26 trails throws
 * `SyntaxError` while it loads. On such an engine this wraps `RegExp` so a
 * pattern passed to it as a string has its modifier groups rewritten by
 * {@link rewriteModifiers} first. A regex literal is parsed by the engine
 * before any wrapper runs, so a literal holding a modifier group is still a
 * `SyntaxError` there.
 */
export function installRegExpModifiers(): void {
  if (hasModifiers()) return;
  const Native = RegExp;
  const fix = (pattern: unknown) =>
    typeof pattern === "string" && pattern.includes("(?") ? rewriteModifiers(pattern) : pattern;
  globalThis.RegExp = new Proxy(Native, {
    construct: (target, [pattern, flags], newTarget) =>
      Reflect.construct(target, [fix(pattern), flags], newTarget),
    apply: (target, _this, [pattern, flags]) =>
      (target as (p: unknown, f?: string) => RegExp)(fix(pattern), flags),
  });
}
