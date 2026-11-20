const MODIFIERS = /^\(\?([imsx]*)(?:-([imsx]*))?:/;

function otherCase(c: string): string {
  const lower = c.toLowerCase();
  return lower === c ? c.toUpperCase() : lower;
}

function isLetter(c: string): boolean {
  return c.toLowerCase() !== c.toUpperCase();
}

export function lowerModifierGroups(source: string): string {
  const icase: boolean[] = [false];
  let out = "";
  let inClass = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const on = icase[icase.length - 1];
    if (c === "\\") {
      out += c + (source[i + 1] ?? "");
      i++;
    } else if (inClass) {
      if (c === "]") inClass = false;
      if (on && isLetter(c) && source[i + 1] === "-" && isLetter(source[i + 2] ?? "")) {
        const end = source[i + 2];
        out += `${c}-${end}${otherCase(c)}-${otherCase(end)}`;
        i += 2;
      } else {
        out += on && isLetter(c) ? c + otherCase(c) : c;
      }
    } else if (c === "[") {
      inClass = true;
      out += c;
      if (source[i + 1] === "^") out += source[++i];
    } else if (c === "(") {
      const m = MODIFIERS.exec(source.slice(i));
      if (m) {
        icase.push(m[1].includes("i") ? true : (m[2] ?? "").includes("i") ? false : on);
        out += "(?:";
        i += m[0].length - 1;
      } else {
        icase.push(on);
        out += c;
      }
    } else if (c === ")") {
      icase.pop();
      out += c;
    } else {
      out += on && isLetter(c) ? `[${c}${otherCase(c)}]` : c;
    }
  }
  return out;
}

const NativeRegExp = RegExp;
let supported = true;
try {
  new NativeRegExp("(?i:a)");
} catch {
  supported = false;
}

if (!supported) {
  function RegExpWithModifiers(pattern: string | RegExp, flags?: string) {
    if (typeof pattern === "string" && pattern.includes("(?")) {
      return new NativeRegExp(lowerModifierGroups(pattern), flags);
    }
    return new NativeRegExp(pattern, flags);
  }
  Object.setPrototypeOf(RegExpWithModifiers, NativeRegExp);
  RegExpWithModifiers.prototype = NativeRegExp.prototype;
  (globalThis as { RegExp: unknown }).RegExp = RegExpWithModifiers;
}
