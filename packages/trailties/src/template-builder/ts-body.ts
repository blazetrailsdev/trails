import type { Body, Ref, Type } from "./types.js";
import { isRef, refMeta } from "./refs.js";

function interp(parts: TemplateStringsArray, vals: ReadonlyArray<Ref | string>) {
  const refs: Ref[] = [];
  let text = "";
  for (let i = 0; i < parts.length; i++) {
    text += parts[i];
    if (i < vals.length) {
      const v = vals[i];
      if (isRef(v)) {
        refs.push(v);
        text += refMeta(v).name;
      } else text += v;
    }
  }
  return { text, refs };
}

export function type(parts: TemplateStringsArray, ...vals: Ref[]): Type {
  const { text, refs } = interp(parts, vals);
  return { __kind: "type", text, refs } as unknown as Type;
}

export function tsBody(parts: TemplateStringsArray, ...vals: Array<Ref | string>): Body {
  const { text, refs } = interp(parts, vals);
  return { __kind: "body", text: dedent(text), refs } as unknown as Body;
}

function dedent(raw: string): string {
  const trimmed = raw.replace(/^\n+/, "").replace(/\s+$/, "");
  if (!trimmed) return "";
  const lines = trimmed.split("\n");
  let min = Infinity;
  for (const l of lines) {
    if (!l.trim()) continue;
    const m = l.match(/^[ \t]*/)![0].length;
    if (m < min) min = m;
  }
  if (!isFinite(min)) min = 0;
  return lines.map((l) => l.slice(min)).join("\n");
}
