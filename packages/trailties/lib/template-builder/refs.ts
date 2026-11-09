import type { Ref } from "./types.js";

interface RefRT {
  __kind: "ref";
  name: string;
  from?: string;
}

export function ref(name: string, from?: string): Ref {
  return { __kind: "ref", name, from } as unknown as Ref;
}
export function isRef(x: unknown): x is Ref {
  return typeof x === "object" && x !== null && (x as RefRT).__kind === "ref";
}
export function refMeta(r: Ref): RefRT {
  return r as unknown as RefRT;
}
