import type { InterfaceDecl, InterfaceOpts, Ref } from "./types.js";
import { type EmitResult, emitField } from "./emit-method.js";
import { refMeta } from "./refs.js";

export function tsInterface(opts: InterfaceOpts): InterfaceDecl {
  return { __kind: "interface", exported: true, ...opts } as unknown as InterfaceDecl;
}

export function emitInterface(i: InterfaceDecl): EmitResult {
  const typeRefs: Ref[] = [];
  let ext = "";
  if (i.extends?.length) {
    ext = ` extends ${i.extends
      .map((r) => {
        typeRefs.push(r);
        return refMeta(r).name;
      })
      .join(", ")}`;
  }
  const members = i.body.map((f) => {
    const e = emitField(f);
    typeRefs.push(...e.typeRefs);
    return `  ${e.text}`;
  });
  return {
    text: `${i.exported !== false ? "export " : ""}interface ${i.name}${ext} {\n${members.join("\n")}\n}`,
    valueRefs: [],
    typeRefs,
  };
}
