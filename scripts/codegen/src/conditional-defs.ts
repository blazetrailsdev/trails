/**
 * `if defined?(TZInfo::DataSources::…) then def m(a) … else def m(a) … end`
 * (et-orbi zone.rb:53-71): a method defined one way or the other at load. When
 * both arms define the same methods with the same parameters, each becomes one
 * `def` whose body takes the branch, which is the same method wherever the
 * condition cannot change after load (a `defined?` of a constant, a version check).
 */
import type { IrFile, N } from "./ir.js";

const seq = (n: N | null | undefined): N[] => (!n ? [] : n.k === "seq" ? n.body : [n]);

function merged(s: N): N[] | null {
  if (s?.k !== "if") return null;
  const t = seq(s.then);
  const e = seq(s.else);
  if (!t.length || t.length !== e.length) return null;
  if (![...t, ...e].every((d) => d.k === "def" && !d.singleton)) return null;
  const out: N[] = [];
  for (const d of t) {
    const o = e.find((x) => x.name === d.name);
    if (!o || JSON.stringify(o.params) !== JSON.stringify(d.params)) return null;
    out.push({ ...d, body: { k: "if", cond: s.cond, then: d.body, else: o.body, l: s.l } });
  }
  return out;
}

function walk(n: unknown): void {
  if (Array.isArray(n)) {
    for (let i = 0; i < n.length; i++) {
      const m = merged(n[i] as N);
      if (m) {
        n.splice(i, 1, ...m);
        i += m.length - 1;
      } else walk(n[i]);
    }
  } else if (n && typeof n === "object") for (const v of Object.values(n)) walk(v);
}

export function mergeConditionalDefs(f: IrFile): void {
  walk(f.body);
}
