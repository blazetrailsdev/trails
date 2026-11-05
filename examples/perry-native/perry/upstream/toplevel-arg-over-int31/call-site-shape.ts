const o = { m(): void {} };
const EXP = 8640000000000000;

const a1 = 1e8 * 864e5, N1 = fwd(a1);
const a2 = 1e8 * 864e5, N2 = before(a2);
const a3 = 1e8 * 864e5, N3 = fwd(8640000000000000);
const a4 = 1e8 * 864e5;
let N5 = 0;
function wrapper(): number { return fwd(a4); }

function before(t: number): number { o.m(); return t; }
function fwd(t: number): number { o.m(); return t; }

N5 = wrapper();
const rows: [string, number][] = [
  ["top-level, forward-declared callee ", N1],
  ["top-level, callee declared earlier ", N2],
  ["top-level, LITERAL argument        ", N3],
  ["called from inside a function      ", N5],
];
for (const [l, v] of rows) console.log(l, ":", v === EXP ? "OK" : "WRONG -> " + v);
