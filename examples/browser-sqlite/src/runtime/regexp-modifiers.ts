const ESCAPE =
  /^\\(?:[pPk][{<][^}>]*[}>]|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|c[A-Za-z]|.)/su;
const GROUP_OPEN = /^\((?:\?(?:<[A-Za-z_$][\w$]*>|<?[=!:]|[ims]*-?[ims]*:))?/;
const MODIFIER_OPEN = /^\(\?([ims]*)(?:-[ims]+)?:/;
const QUANTIFIER = /^\{\d+(?:,\d*)?\}/;

function otherCase(c: string): string | null {
  const u = c.toUpperCase();
  const l = c.toLowerCase();
  if (u === l || u.length !== 1 || l.length !== 1) return null;
  return c === u ? l : u;
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

function inlineFlags(source: string, on: string): string {
  const fold = on.includes("i");
  const dotAll = on.includes("s");
  let out = "";
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const rest = source.slice(i);
    let token: string | null = null;
    if (c === "\\") token = ESCAPE.exec(rest)![0];
    else if (!inClass && c === "(") token = GROUP_OPEN.exec(rest)![0];
    else if (!inClass && c === "{") token = QUANTIFIER.exec(rest)?.[0] ?? null;
    if (token !== null) {
      out += token;
      i += token.length - 1;
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
    } else if (dotAll && c === ".") {
      out += "[^]";
    } else {
      const o = fold ? otherCase(c) : null;
      out += o === null ? c : `[${c}${o}]`;
    }
  }
  return out;
}

function rewriteModifiers(source: string): string {
  let out = "";
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (c === "\\") {
      out += source.slice(i, i + 2);
      i++;
      continue;
    }
    if (inClass) {
      inClass = c !== "]";
    } else if (c === "[") {
      inClass = true;
    } else if (c === "(") {
      const m = MODIFIER_OPEN.exec(source.slice(i));
      if (m && m[0] !== "(?:") {
        const end = groupEnd(source, i);
        const inner = rewriteModifiers(source.slice(i + m[0].length, end - 1));
        out += `(?:${inlineFlags(inner, m[1])})`;
        i = end - 1;
        continue;
      }
    }
    out += c;
  }
  return out;
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
 * string pattern's modifier groups are rewritten into plain `(?:…)` groups
 * first, with the flags a group turns on written into its source: under `i` a
 * cased letter becomes a class of both cases, and under `s` a `.` outside a
 * class becomes `[^]`. What a group turns off, `m`, and a backreference's
 * case-insensitive match take the enclosing pattern's flags; trails' groups
 * turn `i` on inside case-sensitive patterns, which this reproduces.
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
