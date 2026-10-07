/**
 * The classes each Ruby method raises with no message argument (`raise Klass`,
 * `raise Klass unless …`, `raise Klass.new`) and never with one, keyed by the
 * method's TS spellings. A line scan keyed by method name alone: two classes in
 * one file that define the same method are read as one, so a class either of
 * them raises with a message is left out. It under-reports and never
 * over-reports. scripts/build-rails-error-manifest.ts writes the result for
 * `blazetrails/rails-error-parity`'s `inventedMessage` arm.
 */
import { rubyMethodToTsIgnoringSkip } from "./conventions.js";

export type BareRaises = Record<string, string[]>;

const DEF_RE = /^\s*def\s+(?:self\.)?([a-z_]\w*[?!=]?)/;
const RAISE_RE = /\b(?:raise|fail)\s*\(?\s*(?:::)?((?:[A-Z]\w*::)*[A-Z]\w*[a-z]\w*)(\.new\b)?(.*)$/;

/** `bare`, `message`, or null when the raise names no class this scan reads. */
function raiseKind(construction: string | undefined, rest: string): "bare" | "message" | null {
  const tail = rest.trim();
  if (tail.startsWith(",")) return "message";
  if (construction !== undefined && /^\(\s*\)/.test(tail)) return "bare";
  if (construction !== undefined && tail !== "" && !/^(?:if|unless)\b/.test(tail)) return "message";
  return tail === "" || /^(?:\)|\}|;|#|(?:if|unless|end|rescue)\b)/.test(tail) ? "bare" : null;
}

export function scanBareRaises(text: string): BareRaises {
  const byMethod = new Map<string, { bare: Set<string>; message: Set<string> }>();
  let method: string | null = null;
  for (const line of text.split("\n")) {
    if (/^\s*#/.test(line)) continue;
    method = DEF_RE.exec(line)?.[1] ?? method;
    const m = RAISE_RE.exec(line);
    if (!m) continue;
    const kind = raiseKind(m[2], m[3]);
    if (kind === null) continue;
    if (method === null) continue;
    const sets = byMethod.get(method) ?? { bare: new Set(), message: new Set() };
    byMethod.set(method, sets);
    sets[kind].add(m[1].split("::").pop()!);
  }
  const methods: BareRaises = {};
  for (const [rubyName, sets] of byMethod) {
    const names = [...sets.bare].filter((name) => !sets.message.has(name)).sort();
    if (names.length === 0) continue;
    for (const tsName of rubyMethodToTsIgnoringSkip(rubyName) ?? []) {
      if (tsName.startsWith("_") && !rubyName.startsWith("_")) continue;
      methods[tsName] = [...new Set([...(methods[tsName] ?? []), ...names])].sort();
    }
  }
  return methods;
}
