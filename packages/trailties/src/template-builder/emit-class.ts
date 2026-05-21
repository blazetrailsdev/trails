import type { ClassDecl, ClassOpts, Field, Ref } from "./types.js";
import { type EmitResult, emitField, emitMethod, isMethod } from "./emit-method.js";
import { refMeta } from "./refs.js";

export function tsClass(opts: ClassOpts): ClassDecl {
  return { __kind: "class", exported: true, ...opts } as unknown as ClassDecl;
}

export function emitClass(c: ClassDecl): EmitResult {
  const valueRefs: Ref[] = [];
  const typeRefs: Ref[] = [];
  let ext = "";
  if (c.extends) {
    // `extends` requires the base class at runtime.
    valueRefs.push(c.extends);
    ext = ` extends ${refMeta(c.extends).name}`;
  }
  let impl = "";
  if (c.implements?.length) {
    impl = ` implements ${c.implements
      .map((r) => {
        typeRefs.push(r);
        return refMeta(r).name;
      })
      .join(", ")}`;
  }
  const members: string[] = [];
  for (const m of c.body) {
    const e = isMethod(m) ? emitMethod(m) : emitField(m as Field);
    valueRefs.push(...e.valueRefs);
    typeRefs.push(...e.typeRefs);
    members.push(isMethod(m) ? e.text : `  ${e.text}`);
  }
  return {
    text: `${c.exported !== false ? "export " : ""}class ${c.name}${ext}${impl} {\n${members.join("\n\n")}\n}`,
    valueRefs,
    typeRefs,
  };
}
