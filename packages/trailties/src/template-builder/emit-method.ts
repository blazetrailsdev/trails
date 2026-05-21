import type { Field, FieldType, Method, Ref } from "./types.js";
import { isRef, refMeta } from "./refs.js";

export type FieldOpts = Omit<Field, "name" | "type">;

export function tsField(name: string, type: FieldType, opts: FieldOpts = {}): Field {
  return { name, type, ...opts };
}
export function tsMethod(opts: Method): Method {
  return opts;
}
export function isMethod(x: Field | Method): x is Method {
  return Array.isArray((x as Method).params);
}

export function emitType(t: FieldType): { text: string; refs: Ref[] } {
  if (typeof t === "string") return { text: t, refs: [] };
  if (isRef(t)) return { text: refMeta(t).name, refs: [t] };
  return { text: t.text, refs: [...t.refs] };
}

function emitJsDoc(comment: string): string {
  // Neutralize comment terminator and split on newlines so the JSDoc block
  // cannot be broken out of by user-supplied text.
  const safe = comment.replace(/\*\//g, "*\\/");
  const lines = safe.split("\n");
  if (lines.length === 1) return `/** ${lines[0]} */\n  `;
  return `/**\n${lines.map((l) => `   * ${l}`).join("\n")}\n   */\n  `;
}

export function emitField(f: Field): { text: string; refs: Ref[] } {
  const t = emitType(f.type);
  const opt = f.nullable ? "?" : "";
  const init = f.initializer ? ` = ${f.initializer}` : "";
  const head = f.comment ? emitJsDoc(f.comment) : "";
  return { text: `${head}${f.name}${opt}: ${t.text}${init};`, refs: t.refs };
}

export function emitMethod(m: Method): { text: string; refs: Ref[] } {
  const refs: Ref[] = [];
  const paramTexts = m.params.map((p) => {
    const t = emitType(p.type);
    refs.push(...t.refs);
    return `${p.name}: ${t.text}`;
  });
  let ret = "";
  if (m.returnType) {
    const t = emitType(m.returnType);
    refs.push(...t.refs);
    ret = `: ${t.text}`;
  }
  refs.push(...m.body.refs);
  const indented = m.body.text
    .split("\n")
    .map((l) => (l ? `    ${l}` : ""))
    .join("\n");
  const vis = m.visibility && m.visibility !== "public" ? `${m.visibility} ` : "";
  return {
    text: `  ${vis}${m.static ? "static " : ""}${m.async ? "async " : ""}${m.name}(${paramTexts.join(", ")})${ret} {\n${indented}\n  }`,
    refs,
  };
}
